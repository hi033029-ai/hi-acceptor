package com.hiacceptor

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.PackageManager
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject
import java.util.Locale

class HiAcceptorAccessibilityService : AccessibilityService() {
  companion object {
    const val PREFS = "hiaccept.local"
    private const val JEENY = "me.com.easytaxista"
    private const val BOLT = "ee.mtakso.driver"
    @Volatile var instance: HiAcceptorAccessibilityService? = null
  }

  private var lastFingerprint = ""
  private var lastTapAt = 0L
  private var settings = JSONObject()

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

    val target = settings.optString("targetPackage", JEENY)
    if (target != JEENY && target != BOLT) return
    if (event.packageName.toString() != target) return
    if (event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED && event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

    val root = rootInActiveWindow ?: return
    val allText = collectText(root).joinToString(" | ").take(5000)
    if (allText.isBlank()) return

    val decision = evaluate(allText)
    if (!decision.first) {
      if (decision.second.isNotBlank()) prefs.edit().putString("lastEvent", "Skipped: ${decision.second}").apply()
      return
    }
    val fingerprint = (target + "|" + allText.hashCode()).take(160)
    val now = SystemClock.elapsedRealtime()
    if (fingerprint == lastFingerprint || now - lastTapAt < 2500) return
    val button = findAcceptNode(root) ?: run {
      prefs.edit().putString("lastEvent", "Skipped: no explicit accept button identified").apply()
      return
    }

    val clicked = if (button.isClickable) button.performAction(AccessibilityNodeInfo.ACTION_CLICK) else tapCenter(button)
    if (clicked) {
      lastFingerprint = fingerprint
      lastTapAt = now
      prefs.edit().putString("lastEvent", "Accepted a request matching all configured rules").apply()
      notifyAccepted()
    } else {
      prefs.edit().putString("lastEvent", "Skipped: accept control could not be activated").apply()
    }
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

  private fun evaluate(text: String): Pair<Boolean, String> {
    val fareRegex = Regex("(?:fare|price|earnings|السعر|قيمة الرحلة)\\s*[:：]?\\s*(?:(SAR|SR|ر\\.س|JOD|د\\.أ)\\s*)?(\\d+(?:[.,]\\d{1,2})?)\\s*(?:(SAR|SR|ر\\.س|JOD|د\\.أ))?", RegexOption.IGNORE_CASE)
    val pickupRegex = Regex("(?:pickup|pick-up|arrival|arrive|to pickup|وقت الوصول|وقت الاستلام)\\D{0,20}(\\d+(?:[.,]\\d{1,2})?)\\s*(?:min|mins|minute|minutes|دقيقة|دقائق)", RegexOption.IGNORE_CASE)
    val destinationRegex = Regex("(?:destination|drop-?off|to|الوجهة|الى|إلى)\\s*[:：]?\\s*([^,;|]{2,80})", RegexOption.IGNORE_CASE)
    val fare = fareRegex.find(text) ?: return false to "fare not clearly identified"
    val pickup = pickupRegex.find(text) ?: return false to "pickup time not clearly identified"
    val destination = destinationRegex.find(text)?.groupValues?.get(1)?.trim() ?: return false to "destination not clearly identified"
    val currencyToken = fare.groupValues[1].ifBlank { fare.groupValues[3] }
    if (currencyToken.isBlank()) return false to "fare currency not clearly identified"
    val amount = fare.groupValues[2].replace(',', '.').toDoubleOrNull() ?: return false to "fare could not be parsed"
    val eta = pickup.groupValues[1].replace(',', '.').toDoubleOrNull() ?: return false to "pickup time could not be parsed"
    val currency = normalizeCurrency(currencyToken)
    val expectedCurrency = settings.optString("currency", "SAR").uppercase(Locale.ROOT)
    if (currency != expectedCurrency) return false to "currency mismatch"
    val min = settings.optDouble("minFare", 12.0)
    val max = settings.optDouble("maxFare", 80.0)
    val maxPickup = settings.optDouble("maxPickupMinutes", 5.0)
    if (amount < min) return false to "below minimum fare"
    if (amount > max) return false to "above maximum fare"
    if (eta > maxPickup) return false to "pickup exceeds limit"
    if (keywords("excludedKeywords").any { destination.contains(it, true) }) return false to "destination matches exclusion"
    return true to ""
  }

  private fun normalizeCurrency(value: String): String = when (value.uppercase(Locale.ROOT)) {
    "SR", "ر.س" -> "SAR"
    "د.أ" -> "JOD"
    else -> value.uppercase(Locale.ROOT)
  }

  private fun keywords(key: String): List<String> {
    val array = settings.optJSONArray(key) ?: return emptyList()
    return (0 until array.length()).mapNotNull { array.optString(it).trim().takeIf(String::isNotEmpty) }
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
    super.onDestroy()
  }
}
