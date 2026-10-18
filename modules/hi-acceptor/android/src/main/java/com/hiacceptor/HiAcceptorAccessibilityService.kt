package com.hiacceptor

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.accessibilityservice.GestureDescription
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.graphics.Path
import android.graphics.Rect
import android.location.Geocoder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Toast
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

class HiAcceptorAccessibilityService : AccessibilityService() {
  companion object {
    const val PREFS = "hiaccept.local"
    private const val JEENY = "me.com.easytaxista"
    @Volatile var instance: HiAcceptorAccessibilityService? = null
  }

  private data class Parsed(val fare: Double, val currency: String, val pickupMinutes: Double, val destination: String)
  private data class Circle(val id: String, val label: String, val latitude: Double, val longitude: Double, val radiusMeters: Double, val names: List<String>)
  private enum class JeenyScreen { OFFER, ACTIVE_TRIP, OFFLINE_HOME, ONLINE_HOME, UNKNOWN }

  private var lastFingerprint = ""
  private var pendingFingerprint = ""
  private var lastTapAt = 0L
  private var lastOnlineAttemptAt = 0L
  private var lastGeocodeAt = 0L
  private var lastToastAt = 0L
  private var lastSeenWriteAt = 0L
  private var lastActiveTripAt = 0L
  private var eventCount = 0
  private val moneyRegex = Regex(
    "(?:(?:﷼|SAR|SR|ر\\.?\\s?س|ريال)\\s*\\d+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?\\s*(?:﷼|SAR|SR|ر\\.?\\s?س|ريال))",
    RegexOption.IGNORE_CASE
  )
  private val moneyCaptureRegex = Regex(
    "(?:(﷼|SAR|SR|ر\\.?\\s?س|ريال)\\s*(\\d+(?:[.,]\\d{1,2})?)|(\\d+(?:[.,]\\d{1,2})?)\\s*(﷼|SAR|SR|ر\\.?\\s?س|ريال))",
    RegexOption.IGNORE_CASE
  )
  private val etaRegex = Regex(
    "\\d+(?:[.,]\\d{1,2})?\\s*(?:min|mins|minute|minutes|دقيقة|دقائق|د)(?![\\p{L}])",
    RegexOption.IGNORE_CASE
  )
  private var settings = JSONObject()
  private val geocoderExecutor = Executors.newSingleThreadExecutor()
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun onServiceConnected() {
    super.onServiceConnected()
    instance = this
    serviceInfo = (serviceInfo ?: AccessibilityServiceInfo()).apply {
      eventTypes = AccessibilityEvent.TYPES_ALL_MASK
      feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
      flags = flags or AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
      notificationTimeout = 200
      packageNames = arrayOf(JEENY)
    }
    refreshConfiguration()
    showStatusToast("HI Acceptor connected")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(NotificationChannel("hi_acceptor_matches", "Accepted ride requests", NotificationManager.IMPORTANCE_DEFAULT))
    }
  }

  fun refreshConfiguration() {
    val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    settings = runCatching { JSONObject(prefs.getString("settings", "{}") ?: "{}") }.getOrDefault(JSONObject())
  }

  fun scheduleOnlineTap() {
    mainHandler.postDelayed({
      if (getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("operationEnabled", false)) {
        rootInActiveWindow?.let { ensureOnline(it) }
      }
    }, 1500)
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null || event.packageName == null) return
    val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    if (!prefs.getBoolean("operationEnabled", false)) return
    refreshConfiguration()

    val target = JEENY
    if (event.packageName.toString() != target) return
    eventCount++
    val roots = activeJeenyRoots()
    if (roots.isEmpty()) {
      recordSeen(prefs, "Jeeny events received but no readable window")
      return
    }
    val primaryRoot = roots.first()
    val allText = roots.flatMap(::collectText).joinToString(" | ").take(5000)
    if (allText.isBlank()) {
      recordSeen(prefs, "Jeeny events received but screen text is EMPTY (Jeeny may hide it from accessibility)")
      return
    }
    recordSeen(prefs, "Seen: " + allText.take(300))
    val screen = classifyScreen(allText, roots)
    if (screen == JeenyScreen.ACTIVE_TRIP) {
      lastActiveTripAt = SystemClock.elapsedRealtime()
      recordSeen(prefs, "[state=ACTIVE_TRIP] Ignored active trip")
      return
    }
    if (screen == JeenyScreen.OFFLINE_HOME) {
      recordBottomRightControls(prefs, roots)
      if (ensureOnline(primaryRoot)) return
      recordSeen(prefs, "[state=OFFLINE_HOME] No offer")
      return
    }
    if (screen != JeenyScreen.OFFER) {
      if (screen == JeenyScreen.ONLINE_HOME) recordBottomRightControls(prefs, roots)
      recordSeen(prefs, "[state=${screen.name}] Ignored non-offer screen")
      return
    }
    showStatusToast("Scanning ride…", 1200L)
    val candidate = parseDetails(allText)
    val parsed = candidate?.takeIf(::matchesRules)
    val excluded = readCircles("excludedAreas")
    val preferred = readCircle(settings.optJSONObject("preferredArea"))
    val destinationQuery = parsed?.destination ?: extractDestination(allText)
    if (candidate != null && parsed == null) {
      val fingerprint = offerFingerprint(target, allText)
      rejectOrSkip(target, fingerprint, "Ride does not meet your saved fare, pickup-time, currency, or destination rules")
      return
    }
    if (parsed == null && excluded.isEmpty()) {
      val reason = evaluateReason(allText)
      if (reason.isNotBlank()) prefs.edit().putString("lastEvent", "Skipped: $reason").apply()
      return
    }
    val fingerprint = offerFingerprint(target, allText)
    val now = SystemClock.elapsedRealtime()
    if (fingerprint == lastFingerprint || fingerprint == pendingFingerprint || now - lastTapAt < 2500) return

    if (excluded.isEmpty() && preferred == null) {
      completeDecision(target, fingerprint, allText, emptyList())
      return
    }

    if (!Geocoder.isPresent()) {
      if (excluded.isNotEmpty()) prefs.edit().putString("lastEvent", "Skipped: Android location lookup is unavailable; excluded-area check could not be verified").apply()
      else completeDecision(target, fingerprint, allText, emptyList())
      return
    }
    if (destinationQuery.isNullOrBlank()) {
      prefs.edit().putString("lastEvent", "Skipped: destination name could not be identified for area matching").apply()
      return
    }
    if (now - lastGeocodeAt < 1000) return
    lastGeocodeAt = now
    pendingFingerprint = fingerprint
    geocoderExecutor.execute {
      val locations = runCatching {
        @Suppress("DEPRECATION")
        Geocoder(this, Locale.getDefault()).getFromLocationName(destinationQuery, 5).orEmpty().map { it.latitude to it.longitude }
      }.getOrDefault(emptyList())
      mainHandler.post {
        if (pendingFingerprint == fingerprint) pendingFingerprint = ""
        if (locations.isEmpty()) {
          if (excluded.isNotEmpty()) {
            lastFingerprint = fingerprint
            prefs.edit().putString("lastEvent", "Skipped: destination location was not uniquely resolved; excluded-area check could not be verified").apply()
          }
          else completeDecision(target, fingerprint, allText, emptyList())
          return@post
        }
        completeDecision(target, fingerprint, allText, locations)
      }
    }
  }

  private fun rejectOrSkip(target: String, fingerprint: String, reason: String) {
    val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    val root = rootInActiveWindow
    if (root == null || SystemClock.elapsedRealtime() - lastActiveTripAt < 5000L || classifyScreen(collectText(root).joinToString(" | "), listOf(root)) != JeenyScreen.OFFER) {
      prefs.edit().putString("lastEvent", "Skipped: offer screen changed before decline action").apply()
      return
    }
    val rejectNode = root?.let(::findRejectNode)
    if (rejectNode != null) {
      val rejected = if (rejectNode.isClickable) rejectNode.performAction(AccessibilityNodeInfo.ACTION_CLICK) else tapCenter(rejectNode)
      if (rejected) {
        lastFingerprint = fingerprint
        lastTapAt = SystemClock.elapsedRealtime()
        prefs.edit().putString("lastEvent", "Skipped: $reason").apply()
        recordOutcome(prefs, accepted = false)
        showStatusToast("Declined: $reason")
        scheduleMapRecenter()
        return
      }
    }
    if (tapOfferCloseFallback()) {
      lastFingerprint = fingerprint
      lastTapAt = SystemClock.elapsedRealtime()
      prefs.edit().putString("lastEvent", "Skipped: $reason").apply()
      recordOutcome(prefs, accepted = false)
      showStatusToast("Declined: $reason")
      scheduleMapRecenter()
      return
    }
    lastFingerprint = fingerprint
    prefs.edit().putString("lastEvent", "Skipped: $reason; no clear decline control was available").apply()
  }

  private fun ensureOnline(root: AccessibilityNodeInfo): Boolean {
    val now = SystemClock.elapsedRealtime()
    if (now - lastOnlineAttemptAt < 5000) return false
    val onlineNode = findGoOnlineNode(root) ?: return false
    val clicked = if (onlineNode.isClickable) onlineNode.performAction(AccessibilityNodeInfo.ACTION_CLICK) else tapCenter(onlineNode)
    if (clicked) {
      lastOnlineAttemptAt = now
      getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("lastEvent", "Jeeny online mode started").apply()
      return true
    }
    return false
  }

  private fun completeDecision(target: String, fingerprint: String, originalText: String, points: List<Pair<Double, Double>>) {
    val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    if (!prefs.getBoolean("operationEnabled", false)) return
    if (SystemClock.elapsedRealtime() - lastActiveTripAt < 5000L) return
    refreshConfiguration()
    val currentTarget = JEENY
    if (currentTarget != target) return
    val roots = activeJeenyRoots()
    val root = roots.firstOrNull { classifyScreen(collectText(it).joinToString(" | "), listOf(it)) == JeenyScreen.OFFER } ?: return
    if (root.packageName?.toString() != target) return
    val currentText = collectText(root).joinToString(" | ").take(5000)
    val currentFingerprint = offerFingerprint(target, currentText)
    val excluded = readCircles("excludedAreas")
    val preferred = readCircle(settings.optJSONObject("preferredArea"))
    val destinationText = extractDestination(currentText).orEmpty()
    val keywordPoints = smartDestinationPoints(destinationText, excluded)
    val excludedMatch = excluded.firstOrNull { area ->
      points.any { insideCircle(it.first, it.second, area) } || keywordPoints.any { insideCircle(it.first, it.second, area) }
    }
    if (excludedMatch != null) {
      val rejectNode = findRejectNode(root, allowTopRightIcon = true)
      if (rejectNode == null) {
        if (tapOfferCloseFallback()) {
          lastFingerprint = currentFingerprint
          lastTapAt = SystemClock.elapsedRealtime()
          prefs.edit().putString("lastEvent", "Declined a request inside excluded area '${excludedMatch.label}'").apply()
          recordOutcome(prefs, accepted = false)
          showStatusToast("Declined: excluded area")
          scheduleMapRecenter()
          return
        }
        prefs.edit().putString("lastEvent", "Skipped: ride is in excluded area '${excludedMatch.label}', but no explicit decline control was found").apply()
        lastFingerprint = currentFingerprint
        scheduleDeclineRetry(excludedMatch.label, currentFingerprint, 400L)
        scheduleDeclineRetry(excludedMatch.label, currentFingerprint, 1000L)
        return
      }
      val declined = if (rejectNode.isClickable) rejectNode.performAction(AccessibilityNodeInfo.ACTION_CLICK) else tapCenter(rejectNode)
      if (declined) {
        lastFingerprint = currentFingerprint
        lastTapAt = SystemClock.elapsedRealtime()
        prefs.edit().putString("lastEvent", "Declined a request inside excluded area '${excludedMatch.label}'").apply()
        recordOutcome(prefs, accepted = false)
        showStatusToast("Declined: excluded area")
        scheduleMapRecenter()
      } else if (tapOfferCloseFallback()) {
        lastFingerprint = currentFingerprint
        lastTapAt = SystemClock.elapsedRealtime()
        prefs.edit().putString("lastEvent", "Declined a request inside excluded area '${excludedMatch.label}'").apply()
        recordOutcome(prefs, accepted = false)
        showStatusToast("Declined: excluded area")
        scheduleMapRecenter()
      } else prefs.edit().putString("lastEvent", "Skipped: excluded-area decline control could not be activated").apply()
      return
    }
    if (excluded.isNotEmpty() && points.isEmpty()) {
      prefs.edit().putString("lastEvent", "Skipped: excluded-area location was not verified").apply()
      return
    }

    if (parseDetails(currentText)?.let(::matchesRules) == null) {
      prefs.edit().putString("lastEvent", "Skipped: request does not meet your fare, currency, or pickup rules").apply()
      return
    }

    val point = points.firstOrNull()
    val isPreferred = point != null && preferred != null && insideCircle(point.first, point.second, preferred)
    val button = findAcceptNode(root)
    if (button == null) {
      if (tapAcceptFallback()) {
        lastFingerprint = currentFingerprint
        lastTapAt = SystemClock.elapsedRealtime()
        prefs.edit().putString("lastEvent", "Accepted a request matching all configured rules").apply()
        recordOutcome(prefs, accepted = true)
        showStatusToast("Accepted matching ride")
        notifyAccepted()
      } else prefs.edit().putString("lastEvent", "Skipped: no explicit accept button identified").apply()
      return
    }
    val clicked = if (button.isClickable) button.performAction(AccessibilityNodeInfo.ACTION_CLICK) else tapCenter(button)
    if (clicked) {
      lastFingerprint = currentFingerprint
      lastTapAt = SystemClock.elapsedRealtime()
      prefs.edit().putString("lastEvent", if (isPreferred) "Accepted a matching request inside preferred area '${preferred?.label}'" else "Accepted a request matching all configured rules").apply()
      recordOutcome(prefs, accepted = true)
      showStatusToast("Accepted matching ride")
      notifyAccepted()
    } else if (tapAcceptFallback()) {
      lastFingerprint = currentFingerprint
      lastTapAt = SystemClock.elapsedRealtime()
      prefs.edit().putString("lastEvent", "Accepted a request matching all configured rules").apply()
      recordOutcome(prefs, accepted = true)
      showStatusToast("Accepted matching ride")
      notifyAccepted()
    } else prefs.edit().putString("lastEvent", "Skipped: accept control could not be activated").apply()
  }

  private fun scheduleDeclineRetry(label: String, fingerprint: String, delayMs: Long) {
    mainHandler.postDelayed({
      val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
      if (!prefs.getBoolean("operationEnabled", false)) return@postDelayed
      if (lastFingerprint == fingerprint) return@postDelayed
      if (SystemClock.elapsedRealtime() - lastActiveTripAt < 5000L) return@postDelayed
      val root = rootInActiveWindow ?: return@postDelayed
      if (root.packageName?.toString() != JEENY) return@postDelayed
      if (classifyScreen(collectText(root).joinToString(" | "), listOf(root)) != JeenyScreen.OFFER) return@postDelayed
      val node = findRejectNode(root, allowTopRightIcon = true)
      if (node == null) {
        if (tapOfferCloseFallback()) {
          lastFingerprint = fingerprint
          lastTapAt = SystemClock.elapsedRealtime()
          prefs.edit().putString("lastEvent", "Declined a request inside excluded area '$label'").apply()
          recordOutcome(prefs, accepted = false)
          scheduleMapRecenter()
        }
        return@postDelayed
      }
      val clicked = if (node.isClickable) node.performAction(AccessibilityNodeInfo.ACTION_CLICK) else tapCenter(node)
      if (clicked) {
        lastFingerprint = fingerprint
        lastTapAt = SystemClock.elapsedRealtime()
        prefs.edit().putString("lastEvent", "Declined a request inside excluded area '$label'").apply()
        recordOutcome(prefs, accepted = false)
        scheduleMapRecenter()
      }
    }, delayMs)
  }

  private fun scheduleMapRecenter() {
    mainHandler.postDelayed({
      if (SystemClock.elapsedRealtime() - lastActiveTripAt < 5000L) return@postDelayed
      val roots = activeJeenyRoots()
      if (roots.isEmpty()) return@postDelayed
      val text = roots.flatMap(::collectText).joinToString(" | ").take(5000)
      val state = classifyScreen(text, roots)
      if (state == JeenyScreen.ACTIVE_TRIP || state == JeenyScreen.OFFER) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("lastEvent", "Recenter skipped while Jeeny screen is ${state.name}").apply()
        return@postDelayed
      }
      val node = roots.asSequence().mapNotNull(::findMapRecenterNode).firstOrNull()
      if (node == null) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("lastEvent", "Recenter button not found").apply()
        return@postDelayed
      }
      val clicked = node.isClickable && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
      getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("lastEvent", if (clicked) "Declined excluded ride and recentered Jeeny map" else "Recenter button not found").apply()
    }, 400L)
  }

  private fun findMapRecenterNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    val description = sequenceOf(node.contentDescription?.toString(), node.text?.toString()).filterNotNull().joinToString(" ").lowercase(Locale.ROOT)
    val resourceId = node.viewIdResourceName?.lowercase(Locale.ROOT).orEmpty()
    val recenterLabel = listOf("my location", "current location", "your location", "recenter", "re-center", "locate", "center", "relocate", "موقعي", "موقعك", "الموقع الحالي", "إعادة التمركز", "تحديد الموقع").any(description::contains)
    val recenterResource = listOf("my_location", "current_location", "recenter", "location_button", "user_location").any(resourceId::contains)
    if ((recenterLabel || recenterResource) && node.isEnabled && node.isClickable) return node
    for (index in 0 until node.childCount) {
      val child = node.getChild(index) ?: continue
      findMapRecenterNode(child)?.let { return it }
    }
    return null
  }

  private fun parseDetails(text: String): Parsed? {
    val fareRegex = Regex("(?:fare|price|earnings|you['’]?ll\\s+earn|السعر|قيمة الرحلة)[^0-9﷼]{0,36}(?:﷼|SAR|SR|ر\\.س)?\\s*(\\d+(?:[.,]\\d{1,2})?)\\s*(﷼|SAR|SR|ر\\.س)?", RegexOption.IGNORE_CASE)
    val pickupRegex = Regex("(?:(?:pickup|pick-up|arrival|arrive|to pickup|وقت الوصول|وقت الاستلام)\\D{0,20}(\\d+(?:[.,]\\d{1,2})?)\\s*(?:min|mins|minute|minutes|دقيقة|دقائق)|(?:^|[|])\\s*(\\d+(?:[.,]\\d{1,2})?)\\s*(?:min|mins|minute|minutes)\\s*(?:away)?)", RegexOption.IGNORE_CASE)
    val destinationRegex = Regex("(?:destination|drop-?off|to|الوجهة|الى|إلى)\\s*[:：]?\\s*([^,;|]{2,80})", RegexOption.IGNORE_CASE)
    var amountText: String? = null
    var currencyToken = ""
    val keyed = fareRegex.find(text)
    if (keyed != null) {
      amountText = keyed.groupValues[1]
      currencyToken = when {
        keyed.groupValues[2].isNotBlank() -> keyed.groupValues[2]
        keyed.value.contains("﷼") || keyed.value.contains("SAR", true) || keyed.value.contains("SR", true) || keyed.value.contains("ر.س") || keyed.value.contains("you'll", true) || keyed.value.contains("you’ll", true) -> "SAR"
        else -> ""
      }
    }
    if (amountText == null || currencyToken.isBlank()) {
      val money = moneyCaptureRegex.find(text) ?: return null
      amountText = money.groupValues[2].ifBlank { money.groupValues[3] }
      currencyToken = money.groupValues[1].ifBlank { money.groupValues[4] }
    }
    if (currencyToken.isBlank()) return null
    val amount = (amountText ?: return null).replace(',', '.').toDoubleOrNull() ?: return null
    val pickup = pickupRegex.find(text)
    val etaText = pickup?.groupValues?.drop(1)?.firstOrNull(String::isNotBlank)
      ?: Regex("(\\d+(?:[.,]\\d{1,2})?)\\s*(?:min|mins|minute|minutes|دقيقة|دقائق)", RegexOption.IGNORE_CASE).find(text)?.groupValues?.get(1)
      ?: return null
    val eta = etaText.replace(',', '.').toDoubleOrNull() ?: return null
    val destination = destinationRegex.find(text)?.groupValues?.get(1)?.trim().orEmpty()
    return Parsed(amount, normalizeCurrency(currencyToken), eta, destination)
  }

  private fun classifyScreen(allText: String, roots: List<AccessibilityNodeInfo>): JeenyScreen {
    val normalized = allText.lowercase(Locale.ROOT)
    val activeMarkers = listOf(
      "arrived at pickup", "pickup passenger", "picking", "start trip", "end trip", "complete trip", "navigate",
      "وصل إلى موقع الاستلام", "وصل لموقع الاستلام", "استلام الراكب", "جاري الاستلام", "بدء الرحلة", "إنهاء الرحلة", "إكمال الرحلة", "ملاحة"
    )
    if (activeMarkers.any(normalized::contains)) return JeenyScreen.ACTIVE_TRIP

    val offline = listOf("you're offline", "you’re offline", "go online", "غير متصل", "تشغيل").all { marker ->
      when (marker) {
        "you're offline", "you’re offline", "غير متصل" -> normalized.contains(marker)
        else -> true
      }
    } && (normalized.contains("you're offline") || normalized.contains("you’re offline") || normalized.contains("غير متصل"))
    if (offline) return JeenyScreen.OFFLINE_HOME

    val hasMoney = moneyRegex.containsMatchIn(allText)
    val hasMinutes = etaRegex.containsMatchIn(allText)
    val hasAccept = roots.any { findAcceptNode(it) != null }
    if (hasMoney && hasMinutes && hasAccept) return JeenyScreen.OFFER

    val looksOnline = listOf("online", "ready", "start accepting", "متصل", "جاهز").any(normalized::contains)
    return if (looksOnline) JeenyScreen.ONLINE_HOME else JeenyScreen.UNKNOWN
  }

  private fun matchesRules(parsed: Parsed): Boolean {
    val currency = parsed.currency
    val expectedCurrency = settings.optString("currency", "SAR").uppercase(Locale.ROOT)
    if (currency != expectedCurrency) return false
    val min = settings.optDouble("minFare", Double.NaN)
    val max = settings.optDouble("maxFare", Double.NaN)
    val maxPickup = settings.optDouble("maxPickupMinutes", 5.0)
    return min.isFinite() && max.isFinite() && max > min && parsed.fare >= min && parsed.fare <= max && parsed.pickupMinutes <= maxPickup
  }

  private fun evaluateReason(text: String): String {
    if (settings.optDouble("maxFare", 0.0) <= settings.optDouble("minFare", 0.0)) return "minimum and maximum fare must be set"
    if (!Regex("(?:fare|price|earnings|you['’]?ll\\s+earn|السعر|قيمة الرحلة)", RegexOption.IGNORE_CASE).containsMatchIn(text)) return "fare not clearly identified"
    if (!Regex("(?:pickup|pick-up|arrival|arrive|to pickup|وقت الوصول|وقت الاستلام)", RegexOption.IGNORE_CASE).containsMatchIn(text)) return "pickup time not clearly identified"
    return "request details are unclear or do not meet your fare, currency, or pickup rules"
  }

  private fun extractDestination(text: String): String? {
    val destinationRegex = Regex("(?:destination|drop-?off|to|الوجهة|الى|إلى)\\s*[:：]?\\s*([^,;|]{2,80})", RegexOption.IGNORE_CASE)
    return destinationRegex.find(text)?.groupValues?.get(1)?.trim()?.takeIf(String::isNotBlank)
  }

  /**
   * Maps common Arabic/English spellings to the center of a saved exclusion
   * circle. The circle center is the user's selected coordinate, so no
   * unverified third-party neighborhood coordinate is hard-coded here.
   */
  private fun smartDestinationPoints(destination: String, areas: List<Circle>): List<Pair<Double, Double>> {
    val normalized = normalizeDestination(destination)
    if (normalized.isBlank()) return emptyList()
    val aliases = mapOf(
      "الحجون" to "hujun", "al hujun" to "hujun", "al-hujun" to "hujun",
      "الحجون مكة" to "hujun", "hujun" to "hujun",
      "الخالدية" to "khalidiyah", "al khalidiyah" to "khalidiyah", "al-khalidiyah" to "khalidiyah",
      "الخالديه" to "khalidiyah", "khalidiyah" to "khalidiyah"
    )
    val keys = aliases.filter { (alias, _) -> normalized.contains(normalizeDestination(alias)) }.values.toSet()
    return areas.filter { area ->
      val names = listOf(area.label) + area.names
      names.any { name ->
        val label = normalizeDestination(name)
        label.length >= 3 && (normalized.contains(label) || keys.any { key -> label.contains(key) || key.contains(label) })
      }
    }.map { it.latitude to it.longitude }
  }

  private fun normalizeDestination(value: String): String = value.lowercase(Locale.ROOT)
    .replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا')
    .replace('ة', 'ه').replace('ى', 'ي')
    .replace(Regex("[^\\p{L}\\p{N}]+"), " ")
    .trim()

  private fun notifyAccepted() {
    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, "hi_acceptor_matches") else Notification.Builder(this)
    val notification = builder.setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle("HI Acceptor matched a ride")
      .setContentText("A request in your selected driver app matched all your rules.")
      .setAutoCancel(true)
      .build()
    (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(2401, notification)
  }

  private fun readCircles(key: String): List<Circle> {
    val array = settings.optJSONArray(key) ?: return emptyList()
    return (0 until minOf(array.length(), 5)).mapNotNull { readCircle(array.optJSONObject(it)) }
  }

  private fun readCircle(value: JSONObject?): Circle? {
    if (value == null) return null
    val lat = value.optDouble("latitude", Double.NaN)
    val lng = value.optDouble("longitude", Double.NaN)
    val radius = value.optDouble("radiusMeters", Double.NaN)
    if (!lat.isFinite() || lat !in -90.0..90.0 || !lng.isFinite() || lng !in -180.0..180.0 || !radius.isFinite() || radius !in 250.0..10000.0) return null
    val names = value.optJSONArray("names")?.let { array -> (0 until minOf(array.length(), 40)).mapNotNull { array.optString(it).takeIf(String::isNotBlank) } } ?: emptyList()
    return Circle(value.optString("id"), value.optString("label", "Area"), lat, lng, radius, names)
  }

  private fun insideCircle(latitude: Double, longitude: Double, circle: Circle): Boolean = distanceMeters(latitude, longitude, circle.latitude, circle.longitude) <= circle.radiusMeters

  private fun distanceMeters(aLat: Double, aLng: Double, bLat: Double, bLng: Double): Double {
    val toRadians = Math.PI / 180.0
    val dLat = (bLat - aLat) * toRadians
    val dLng = (bLng - aLng) * toRadians
    val h = sin(dLat / 2) * sin(dLat / 2) + cos(aLat * toRadians) * cos(bLat * toRadians) * sin(dLng / 2) * sin(dLng / 2)
    return 6371000.0 * 2 * atan2(sqrt(h), sqrt(1 - h))
  }

  private fun normalizeCurrency(value: String): String {
    val v = value.uppercase(Locale.ROOT).replace(" ", "").replace(".", "")
    return when (v) {
      "SR", "رس", "﷼", "ريال", "SAR" -> "SAR"
      else -> v
    }
  }

  private fun collectText(node: AccessibilityNodeInfo): List<String> {
    val own = sequenceOf(node.text?.toString(), node.contentDescription?.toString()).filterNotNull().filter(String::isNotBlank).toList()
    val children = (0 until node.childCount).flatMap { index -> node.getChild(index)?.let(::collectText) ?: emptyList() }
    return own + children
  }

  private fun recordBottomRightControls(prefs: SharedPreferences, roots: List<AccessibilityNodeInfo>) {
    val width = resources.displayMetrics.widthPixels
    val height = resources.displayMetrics.heightPixels
    val controls = mutableListOf<String>()
    fun visit(node: AccessibilityNodeInfo) {
      val bounds = Rect().also { node.getBoundsInScreen(it) }
      if (node.isClickable && bounds.centerX() >= width / 2 && bounds.centerY() >= height / 2) {
        controls += "${node.className}|${node.contentDescription ?: node.text ?: ""}|${node.viewIdResourceName ?: ""}|${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}"
      }
      for (index in 0 until node.childCount) node.getChild(index)?.let(::visit)
    }
    roots.forEach(::visit)
    if (controls.isNotEmpty()) recordSeen(prefs, "[state=HOME] bottom-right controls: ${controls.distinct().take(12).joinToString(" || ")}")
  }

  private fun activeJeenyRoots(): List<AccessibilityNodeInfo> {
    val roots = mutableListOf<AccessibilityNodeInfo>()
    rootInActiveWindow?.let { roots.add(it) }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      windows.orEmpty().forEach { window ->
        val root = window.root ?: return@forEach
        if (root.packageName?.toString() == JEENY && roots.none { it === root }) roots.add(root)
      }
    }
    return roots.filter { it.packageName?.toString() == JEENY }
  }

  private fun findGoOnlineNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    val label = sequenceOf(node.text?.toString(), node.contentDescription?.toString()).filterNotNull().joinToString(" ").lowercase(Locale.ROOT)
    val goOnline = listOf("go online", "start accepting", "start accepting rides", "start work", "بدء العمل", "بدء استقبال الرحلات", "تشغيل").any(label::contains)
    if (goOnline && node.isEnabled && (node.isClickable || node.childCount == 0)) return node
    for (index in 0 until node.childCount) {
      val child = node.getChild(index) ?: continue
      findGoOnlineNode(child)?.let { return it }
    }
    return null
  }

  private fun findAcceptNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    val label = sequenceOf(node.text?.toString(), node.contentDescription?.toString()).filterNotNull().joinToString(" ").lowercase(Locale.ROOT)
    val explicitAccept = listOf("accept", "accept ride", "accept now", "take ride", "قبول", "قبول الطلب", "اقبل").any(label::contains)
    if (explicitAccept && node.isEnabled && (node.isClickable || node.childCount == 0)) return node
    for (index in 0 until node.childCount) {
      val child = node.getChild(index) ?: continue
      findAcceptNode(child)?.let { return it }
    }
    return null
  }

  private fun findRejectNode(node: AccessibilityNodeInfo, allowTopRightIcon: Boolean = false): AccessibilityNodeInfo? {
    val label = sequenceOf(node.text?.toString(), node.contentDescription?.toString()).filterNotNull().joinToString(" ").lowercase(Locale.ROOT)
    val resourceId = node.viewIdResourceName?.lowercase(Locale.ROOT).orEmpty()
    val explicitDecline = listOf("decline", "decline ride", "reject", "reject ride", "skip", "skip ride", "ignore", "not interested", "dismiss", "cancel request", "no thanks", "رفض", "رفض الطلب", "تخطي", "تخطي الرحلة", "تجاهل", "إغلاق").any(label::contains)
    val declineResource = listOf("decline", "reject", "skip", "cancel", "dismiss", "close").any(resourceId::contains)
    val iconClass = node.className?.toString()?.lowercase(Locale.ROOT).orEmpty().let { it.contains("imagebutton") || it.contains("imageview") }
    val bounds = Rect().also { node.getBoundsInScreen(it) }
    val topRightRideIcon = allowTopRightIcon && iconClass && node.isEnabled && node.isClickable && bounds.top < resources.displayMetrics.heightPixels * 0.60f && bounds.left > resources.displayMetrics.widthPixels * 0.55f
    if ((explicitDecline || declineResource || topRightRideIcon) && node.isEnabled && (node.isClickable || node.childCount == 0)) return node
    for (index in 0 until node.childCount) {
      val child = node.getChild(index) ?: continue
      findRejectNode(child, allowTopRightIcon)?.let { return it }
    }
    return null
  }

  private fun tapCenter(node: AccessibilityNodeInfo): Boolean {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    if (bounds.isEmpty) return false
    val path = Path().apply { moveTo(bounds.exactCenterX(), bounds.exactCenterY()) }
    val gesture = GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, 80)).build()
    return dispatchGesture(gesture, null, null)
  }

  private fun tapScreenFraction(x: Float, y: Float): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
    val path = Path().apply { moveTo(resources.displayMetrics.widthPixels * x, resources.displayMetrics.heightPixels * y) }
    val gesture = GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, 80)).build()
    return dispatchGesture(gesture, null, null)
  }

  private fun tapOfferCloseFallback(): Boolean = tapScreenFraction(0.885f, 0.555f)

  private fun tapAcceptFallback(): Boolean = tapScreenFraction(0.50f, 0.945f)

  private fun showStatusToast(message: String, cooldownMs: Long = 2500L) {
    val now = SystemClock.elapsedRealtime()
    if (now - lastToastAt < cooldownMs) return
    lastToastAt = now
    mainHandler.post { Toast.makeText(applicationContext, message, Toast.LENGTH_SHORT).show() }
  }

  private fun recordSeen(prefs: SharedPreferences, note: String) {
    val now = SystemClock.elapsedRealtime()
    if (now - lastSeenWriteAt < 1000) return
    lastSeenWriteAt = now
    prefs.edit().putString("lastSeen", "$note [events: $eventCount]").apply()
  }

  private fun offerFingerprint(target: String, text: String): String {
    val normalized = text.lowercase(Locale.ROOT).replace(Regex("\\s+"), " ").trim()
    return (target + "|" + normalized.hashCode()).take(160)
  }

  private fun recordOutcome(prefs: SharedPreferences, accepted: Boolean) {
    val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    val stats = runCatching { JSONObject(prefs.getString("outcomeStats", "{}") ?: "{}") }.getOrDefault(JSONObject())
    val lifetime = stats.optJSONObject("lifetime") ?: JSONObject().also { stats.put("lifetime", it) }
    val lifetimeKey = if (accepted) "accepted" else "declined"
    lifetime.put(lifetimeKey, lifetime.optInt(lifetimeKey, 0) + 1)
    val days = stats.optJSONObject("days") ?: JSONObject().also { stats.put("days", it) }
    val day = days.optJSONObject(today) ?: JSONObject().also { days.put(today, it) }
    day.put(lifetimeKey, day.optInt(lifetimeKey, 0) + 1)
    val cutoff = java.util.Calendar.getInstance().apply { add(java.util.Calendar.DAY_OF_YEAR, -6) }
    val cutoffText = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cutoff.time)
    days.keys().asSequence().filter { it < cutoffText }.toList().forEach { days.remove(it) }
    prefs.edit().putString("outcomeStats", stats.toString()).apply()
  }

  override fun onInterrupt() {}

  override fun onDestroy() {
    instance = null
    geocoderExecutor.shutdownNow()
    super.onDestroy()
  }
}
