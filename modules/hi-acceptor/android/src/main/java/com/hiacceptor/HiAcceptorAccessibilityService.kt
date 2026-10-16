package com.hiacceptor

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
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
import org.json.JSONObject
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

  private var lastFingerprint = ""
  private var pendingFingerprint = ""
  private var lastTapAt = 0L
  private var lastOnlineAttemptAt = 0L
  private var lastGeocodeAt = 0L
  private var settings = JSONObject()
  private val geocoderExecutor = Executors.newSingleThreadExecutor()
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun onServiceConnected() {
    super.onServiceConnected()
    instance = this
    refreshConfiguration()
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
    if (event.eventType !in listOf(AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED, AccessibilityEvent.TYPE_WINDOWS_CHANGED, AccessibilityEvent.TYPE_VIEW_CLICKED, AccessibilityEvent.TYPE_VIEW_SCROLLED, AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED, AccessibilityEvent.TYPE_VIEW_FOCUSED)) return

    val root = rootInActiveWindow ?: return
    if (ensureOnline(root)) return
    val allText = collectText(root).joinToString(" | ").take(5000)
    if (allText.isBlank()) return
    if (!isJeenyOfferCard(allText)) return
    val candidate = parseDetails(allText)
    val parsed = candidate?.takeIf(::matchesRules)
    val excluded = readCircles("excludedAreas")
    val preferred = readCircle(settings.optJSONObject("preferredArea"))
    val destinationQuery = parsed?.destination ?: extractDestination(allText)
    if (candidate != null && parsed == null) {
      val fingerprint = (target + "|" + allText.hashCode()).take(160)
      rejectOrSkip(target, fingerprint, "Ride does not meet your saved fare, pickup-time, currency, or destination rules")
      return
    }
    if (parsed == null && excluded.isEmpty()) {
      val reason = evaluateReason(allText)
      if (reason.isNotBlank()) prefs.edit().putString("lastEvent", "Skipped: $reason").apply()
      return
    }
    val fingerprint = (target + "|" + allText.hashCode()).take(160)
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
    val rejectNode = root?.let(::findRejectNode)
    if (rejectNode != null) {
      val rejected = if (rejectNode.isClickable) rejectNode.performAction(AccessibilityNodeInfo.ACTION_CLICK) else tapCenter(rejectNode)
      if (rejected) {
        lastFingerprint = fingerprint
        lastTapAt = SystemClock.elapsedRealtime()
        prefs.edit().putString("lastEvent", "Skipped: $reason").apply()
        scheduleMapRecenter()
        return
      }
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
    refreshConfiguration()
    val currentTarget = JEENY
    if (currentTarget != target) return
    val root = rootInActiveWindow ?: return
    if (root.packageName?.toString() != target) return
    val currentText = collectText(root).joinToString(" | ").take(5000)
    val currentFingerprint = (target + "|" + currentText.hashCode()).take(160)
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
    val button = findAcceptNode(root) ?: run {
      prefs.edit().putString("lastEvent", "Skipped: no explicit accept button identified").apply()
      return
    }
    val clicked = if (button.isClickable) button.performAction(AccessibilityNodeInfo.ACTION_CLICK) else tapCenter(button)
    if (clicked) {
      lastFingerprint = currentFingerprint
      lastTapAt = SystemClock.elapsedRealtime()
      prefs.edit().putString("lastEvent", if (isPreferred) "Accepted a matching request inside preferred area '${preferred?.label}'" else "Accepted a request matching all configured rules").apply()
      notifyAccepted()
    } else prefs.edit().putString("lastEvent", "Skipped: accept control could not be activated").apply()
  }

  private fun scheduleDeclineRetry(label: String, fingerprint: String, delayMs: Long) {
    mainHandler.postDelayed({
      val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
      if (!prefs.getBoolean("operationEnabled", false)) return@postDelayed
      val root = rootInActiveWindow ?: return@postDelayed
      if (root.packageName?.toString() != JEENY) return@postDelayed
      val node = findRejectNode(root, allowTopRightIcon = true) ?: return@postDelayed
      val clicked = if (node.isClickable) node.performAction(AccessibilityNodeInfo.ACTION_CLICK) else tapCenter(node)
      if (clicked) {
        lastFingerprint = fingerprint
        lastTapAt = SystemClock.elapsedRealtime()
        prefs.edit().putString("lastEvent", "Declined a request inside excluded area '$label'").apply()
        scheduleMapRecenter()
      }
    }, delayMs)
  }

  private fun scheduleMapRecenter() {
    mainHandler.postDelayed({
      val root = rootInActiveWindow ?: return@postDelayed
      if (root.packageName?.toString() != JEENY) return@postDelayed
      val node = findMapRecenterNode(root) ?: return@postDelayed
      val clicked = if (node.isClickable) node.performAction(AccessibilityNodeInfo.ACTION_CLICK) else tapCenter(node)
      if (clicked) getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("lastEvent", "Declined excluded ride and recentered Jeeny map").apply()
    }, 400L)
  }

  private fun findMapRecenterNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    val description = node.contentDescription?.toString()?.lowercase(Locale.ROOT).orEmpty()
    val resourceId = node.viewIdResourceName?.lowercase(Locale.ROOT).orEmpty()
    val recenterLabel = listOf("my location", "current location", "your location", "recenter", "موقعي", "موقعك", "الموقع الحالي").any(description::contains)
    val recenterResource = listOf("my_location", "current_location", "recenter", "location_button", "user_location").any(resourceId::contains)
    if ((recenterLabel || recenterResource) && node.isEnabled && (node.isClickable || node.childCount == 0)) return node
    for (index in 0 until node.childCount) {
      val child = node.getChild(index) ?: continue
      findMapRecenterNode(child)?.let { return it }
    }
    return null
  }

  private fun parseDetails(text: String): Parsed? {
    val fareRegex = Regex("(?:fare|price|earnings|you['’]?ll\\s+earn|السعر|قيمة الرحلة)[^0-9﷼]{0,24}(?:﷼|SAR|SR|ر\\.س)?\\s*(\\d+(?:[.,]\\d{1,2})?)\\s*(﷼|SAR|SR|ر\\.س)?", RegexOption.IGNORE_CASE)
    val pickupRegex = Regex("(?:pickup|pick-up|arrival|arrive|to pickup|وقت الوصول|وقت الاستلام)\\D{0,20}(\\d+(?:[.,]\\d{1,2})?)\\s*(?:min|mins|minute|minutes|دقيقة|دقائق)", RegexOption.IGNORE_CASE)
    val destinationRegex = Regex("(?:destination|drop-?off|to|الوجهة|الى|إلى)\\s*[:：]?\\s*([^,;|]{2,80})", RegexOption.IGNORE_CASE)
    val fare = fareRegex.find(text) ?: return null
    val pickup = pickupRegex.find(text) ?: return null
    val destination = destinationRegex.find(text)?.groupValues?.get(1)?.trim()?.takeIf(String::isNotBlank) ?: return null
    val currencyToken = when {
      fare.groupValues[2].isNotBlank() -> fare.groupValues[2]
      fare.value.contains("﷼") || fare.value.contains("SAR", true) || fare.value.contains("SR", true) || fare.value.contains("ر.س") -> "SAR"
      else -> ""
    }
    if (currencyToken.isBlank()) return null
    val amount = fare.groupValues[1].replace(',', '.').toDoubleOrNull() ?: return null
    val eta = pickup.groupValues[1].replace(',', '.').toDoubleOrNull() ?: return null
    return Parsed(amount, normalizeCurrency(currencyToken), eta, destination)
  }

  private fun isJeenyOfferCard(text: String): Boolean {
    val normalized = text.lowercase(Locale.ROOT)
    return normalized.contains("you'll earn") || normalized.contains("you’ll earn") || normalized.contains("accept offer") || normalized.contains("﷼")
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
    if (!Regex("(?:fare|price|earnings|السعر|قيمة الرحلة)", RegexOption.IGNORE_CASE).containsMatchIn(text)) return "fare not clearly identified"
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

  private fun normalizeCurrency(value: String): String = when (value.uppercase(Locale.ROOT)) {
    "SR", "ر.س", "﷼" -> "SAR"
    else -> value.uppercase(Locale.ROOT)
  }

  private fun collectText(node: AccessibilityNodeInfo): List<String> {
    val own = sequenceOf(node.text?.toString(), node.contentDescription?.toString()).filterNotNull().filter(String::isNotBlank).toList()
    val children = (0 until node.childCount).flatMap { index -> node.getChild(index)?.let(::collectText) ?: emptyList() }
    return own + children
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

  override fun onInterrupt() {}

  override fun onDestroy() {
    instance = null
    geocoderExecutor.shutdownNow()
    super.onDestroy()
  }
}
