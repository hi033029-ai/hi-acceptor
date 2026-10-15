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
    private const val BOLT = "ee.mtakso.driver"
    @Volatile var instance: HiAcceptorAccessibilityService? = null
  }

  private data class Parsed(val fare: Double, val currency: String, val pickupMinutes: Double, val destination: String)
  private data class Circle(val id: String, val label: String, val latitude: Double, val longitude: Double, val radiusMeters: Double)

  private var lastFingerprint = ""
  private var pendingFingerprint = ""
  private var lastTapAt = 0L
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

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null || event.packageName == null) return
    val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    if (!prefs.getBoolean("operationEnabled", false)) return
    refreshConfiguration()

    val target = settings.optString("targetPackage", JEENY)
    if (target != JEENY && target != BOLT) return
    if (event.packageName.toString() != target) return
    if (event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED && event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

    val root = rootInActiveWindow ?: return
    val allText = collectText(root).joinToString(" | ").take(5000)
    if (allText.isBlank()) return
    val parsed = evaluate(allText)
    val excluded = readCircles("excludedAreas")
    val preferred = readCircle(settings.optJSONObject("preferredArea"))
    val destinationQuery = parsed?.destination ?: extractDestination(allText)
    if (parsed == null && excluded.isEmpty()) {
      val reason = evaluateReason(allText)
      if (reason.isNotBlank()) prefs.edit().putString("lastEvent", "Skipped: $reason").apply()
      return
    }
    val fingerprint = (target + "|" + allText.hashCode()).take(160)
    val now = SystemClock.elapsedRealtime()
    if (fingerprint == lastFingerprint || fingerprint == pendingFingerprint || now - lastTapAt < 2500) return

    if (excluded.isEmpty() && preferred == null) {
      completeDecision(target, fingerprint, allText, null)
      return
    }

    if (!Geocoder.isPresent()) {
      if (excluded.isNotEmpty()) prefs.edit().putString("lastEvent", "Skipped: Android location lookup is unavailable; excluded-area check could not be verified").apply()
      else completeDecision(target, fingerprint, allText, null)
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
      val location = runCatching {
        @Suppress("DEPRECATION")
        Geocoder(this, Locale.getDefault()).getFromLocationName(destinationQuery, 2)?.takeIf { it.size == 1 }?.firstOrNull()
      }.getOrNull()
      mainHandler.post {
        if (pendingFingerprint == fingerprint) pendingFingerprint = ""
        if (location == null) {
          if (excluded.isNotEmpty()) {
            lastFingerprint = fingerprint
            prefs.edit().putString("lastEvent", "Skipped: destination location was not uniquely resolved; excluded-area check could not be verified").apply()
          }
          else completeDecision(target, fingerprint, allText, null)
          return@post
        }
        completeDecision(target, fingerprint, allText, location.latitude to location.longitude)
      }
    }
  }

  private fun completeDecision(target: String, fingerprint: String, originalText: String, point: Pair<Double, Double>?) {
    val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    if (!prefs.getBoolean("operationEnabled", false)) return
    refreshConfiguration()
    val currentTarget = settings.optString("targetPackage", JEENY)
    if (currentTarget != target) return
    val root = rootInActiveWindow ?: return
    if (root.packageName?.toString() != target) return
    val currentText = collectText(root).joinToString(" | ").take(5000)
    if ((target + "|" + currentText.hashCode()).take(160) != fingerprint) return
    val excluded = readCircles("excludedAreas")
    val preferred = readCircle(settings.optJSONObject("preferredArea"))
    val excludedMatch = if (excluded.isNotEmpty() && point != null) excluded.firstOrNull { insideCircle(point.first, point.second, it) } else null
    if (excludedMatch != null) {
      val rejectNode = findRejectNode(root)
      if (rejectNode == null) {
        prefs.edit().putString("lastEvent", "Skipped: ride is in excluded area '${excludedMatch.label}', but no explicit decline control was found").apply()
        lastFingerprint = fingerprint
        return
      }
      val declined = if (rejectNode.isClickable) rejectNode.performAction(AccessibilityNodeInfo.ACTION_CLICK) else tapCenter(rejectNode)
      if (declined) {
        lastFingerprint = fingerprint
        lastTapAt = SystemClock.elapsedRealtime()
        prefs.edit().putString("lastEvent", "Declined a request inside excluded area '${excludedMatch.label}'").apply()
      } else prefs.edit().putString("lastEvent", "Skipped: excluded-area decline control could not be activated").apply()
      return
    }
    if (excluded.isNotEmpty() && point == null) {
      prefs.edit().putString("lastEvent", "Skipped: excluded-area location was not verified").apply()
      return
    }

    if (evaluate(currentText) == null) {
      prefs.edit().putString("lastEvent", "Skipped: request does not meet your fare, currency, or pickup rules").apply()
      return
    }

    val isPreferred = point != null && preferred != null && insideCircle(point.first, point.second, preferred)
    val button = findAcceptNode(root) ?: run {
      prefs.edit().putString("lastEvent", "Skipped: no explicit accept button identified").apply()
      return
    }
    val clicked = if (button.isClickable) button.performAction(AccessibilityNodeInfo.ACTION_CLICK) else tapCenter(button)
    if (clicked) {
      lastFingerprint = fingerprint
      lastTapAt = SystemClock.elapsedRealtime()
      prefs.edit().putString("lastEvent", if (isPreferred) "Accepted a matching request inside preferred area '${preferred?.label}'" else "Accepted a request matching all configured rules").apply()
      notifyAccepted()
    } else prefs.edit().putString("lastEvent", "Skipped: accept control could not be activated").apply()
  }

  private fun evaluate(text: String): Parsed? {
    val fareRegex = Regex("(?:fare|price|earnings|السعر|قيمة الرحلة)\\s*[:：]?\\s*(?:(SAR|SR|ر\\.س|JOD|د\\.أ)\\s*)?(\\d+(?:[.,]\\d{1,2})?)\\s*(?:(SAR|SR|ر\\.س|JOD|د\\.أ))?", RegexOption.IGNORE_CASE)
    val pickupRegex = Regex("(?:pickup|pick-up|arrival|arrive|to pickup|وقت الوصول|وقت الاستلام)\\D{0,20}(\\d+(?:[.,]\\d{1,2})?)\\s*(?:min|mins|minute|minutes|دقيقة|دقائق)", RegexOption.IGNORE_CASE)
    val destinationRegex = Regex("(?:destination|drop-?off|to|الوجهة|الى|إلى)\\s*[:：]?\\s*([^,;|]{2,80})", RegexOption.IGNORE_CASE)
    val fare = fareRegex.find(text) ?: return null
    val pickup = pickupRegex.find(text) ?: return null
    val destination = destinationRegex.find(text)?.groupValues?.get(1)?.trim()?.takeIf(String::isNotBlank) ?: return null
    val currencyToken = fare.groupValues[1].ifBlank { fare.groupValues[3] }
    if (currencyToken.isBlank()) return null
    val amount = fare.groupValues[2].replace(',', '.').toDoubleOrNull() ?: return null
    val eta = pickup.groupValues[1].replace(',', '.').toDoubleOrNull() ?: return null
    val currency = normalizeCurrency(currencyToken)
    val expectedCurrency = settings.optString("currency", "SAR").uppercase(Locale.ROOT)
    if (currency != expectedCurrency) return null
    val min = settings.optDouble("minFare", Double.NaN)
    val max = settings.optDouble("maxFare", Double.NaN)
    val maxPickup = settings.optDouble("maxPickupMinutes", 5.0)
    if (!min.isFinite() || !max.isFinite() || max <= min || amount < min || amount > max || eta > maxPickup) return null
    return Parsed(amount, currency, eta, destination)
  }

  private fun evaluateReason(text: String): String {
    if (settings.optDouble("maxFare", 0.0) <= settings.optDouble("minFare", 0.0)) return "minimum and maximum fare must be set"
    if (!Regex("(?:fare|price|earnings|السعر|قيمة الرحلة)", RegexOption.IGNORE_CASE).containsMatchIn(text)) return "fare not clearly identified"
    if (!Regex("(?:pickup|pick-up|arrival|arrive|to pickup|وقت الوصول|وقت الاستلام)", RegexOption.IGNORE_CASE).containsMatchIn(text)) return "pickup time not clearly identified"
    return "request details are unclear or do not meet your fare, currency, or pickup rules"
  }

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
    return Circle(value.optString("id"), value.optString("label", "Area"), lat, lng, radius)
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
    "SR", "ر.س" -> "SAR"
    "د.أ" -> "JOD"
    else -> value.uppercase(Locale.ROOT)
  }

  private fun collectText(node: AccessibilityNodeInfo): List<String> {
    val own = sequenceOf(node.text?.toString(), node.contentDescription?.toString()).filterNotNull().filter(String::isNotBlank).toList()
    val children = (0 until node.childCount).flatMap { index -> node.getChild(index)?.let(::collectText) ?: emptyList() }
    return own + children
  }

  private fun findAcceptNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    val label = sequenceOf(node.text?.toString(), node.contentDescription?.toString()).filterNotNull().joinToString(" ").lowercase(Locale.ROOT)
    val explicitAccept = listOf("accept", "accept ride", "take ride", "قبول", "اقبل").any(label::contains)
    if (explicitAccept && node.isEnabled && (node.isClickable || node.childCount == 0)) return node
    for (index in 0 until node.childCount) {
      val child = node.getChild(index) ?: continue
      findAcceptNode(child)?.let { return it }
    }
    return null
  }

  private fun findRejectNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    val label = sequenceOf(node.text?.toString(), node.contentDescription?.toString()).filterNotNull().joinToString(" ").lowercase(Locale.ROOT)
    val explicitDecline = listOf("decline", "reject", "skip ride", "not interested", "رفض", "تخطي الرحلة").any(label::contains)
    if (explicitDecline && node.isEnabled && (node.isClickable || node.childCount == 0)) return node
    for (index in 0 until node.childCount) {
      val child = node.getChild(index) ?: continue
      findRejectNode(child)?.let { return it }
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
