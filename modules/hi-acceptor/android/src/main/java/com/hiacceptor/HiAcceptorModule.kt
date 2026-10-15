package com.hiacceptor

import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.text.TextUtils
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class HiAcceptorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HiAcceptor")

    AsyncFunction("isAccessibilityEnabled") {
      val expected = "${appContext.reactContext?.packageName}/${HiAcceptorAccessibilityService::class.java.name}"
      val enabled = Settings.Secure.getString(appContext.reactContext!!.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: ""
      val splitter = TextUtils.SimpleStringSplitter(':')
      splitter.setString(enabled)
      generateSequence { if (splitter.hasNext()) splitter.next() else null }.any { it.equals(expected, true) }
    }

    AsyncFunction("openAccessibilitySettings") {
      val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      appContext.reactContext?.startActivity(intent)
    }

    AsyncFunction("setOperationEnabled") { enabled: Boolean ->
      val prefs = appContext.reactContext!!.getSharedPreferences(HiAcceptorAccessibilityService.PREFS, Context.MODE_PRIVATE)
      prefs.edit().putBoolean("operationEnabled", enabled).apply()
      HiAcceptorAccessibilityService.instance?.refreshConfiguration()
    }

    AsyncFunction("saveSettings") { settings: Map<String, Any> ->
      val json = JSONObject(settings)
      appContext.reactContext!!.getSharedPreferences(HiAcceptorAccessibilityService.PREFS, Context.MODE_PRIVATE)
        .edit().putString("settings", json.toString()).apply()
      HiAcceptorAccessibilityService.instance?.refreshConfiguration()
    }

    AsyncFunction("getStatus") {
      val prefs = appContext.reactContext!!.getSharedPreferences(HiAcceptorAccessibilityService.PREFS, Context.MODE_PRIVATE)
      val expected = "${appContext.reactContext?.packageName}/${HiAcceptorAccessibilityService::class.java.name}"
      val enabledServices = Settings.Secure.getString(appContext.reactContext!!.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: ""
      mapOf(
        "enabled" to prefs.getBoolean("operationEnabled", false),
        "accessibilityEnabled" to enabledServices.split(":").any { it.equals(expected, true) },
        "lastEvent" to (prefs.getString("lastEvent", null) ?: "No request processed yet")
      )
    }
  }
}
