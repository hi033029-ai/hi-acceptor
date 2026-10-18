package com.hiacceptor

import android.content.Context
import android.content.Intent
import android.net.Uri
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

    AsyncFunction("openAppSettings") {
      val context = appContext.reactContext!!
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    AsyncFunction("setOperationEnabled") { enabled: Boolean ->
      val prefs = appContext.reactContext!!.getSharedPreferences(HiAcceptorAccessibilityService.PREFS, Context.MODE_PRIVATE)
      prefs.edit().putBoolean("operationEnabled", enabled).apply()
      HiAcceptorAccessibilityService.instance?.refreshConfiguration()
    }

    AsyncFunction("launchJeeny") {
      val context = appContext.reactContext!!
      val launchIntent = context.packageManager.getLaunchIntentForPackage("me.com.easytaxista")
        ?: throw IllegalStateException("Jeeny Driver package me.com.easytaxista was not visible to HI Acceptor; reinstall the latest APK and make sure Jeeny Driver is installed")
      launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      runCatching { context.startActivity(launchIntent) }
        .getOrElse { throw IllegalStateException("Jeeny Driver was found but could not be launched", it) }
      HiAcceptorAccessibilityService.instance?.scheduleOnlineTap()
    }

    AsyncFunction("saveSettings") { settingsJson: String ->
      val json = runCatching { JSONObject(settingsJson) }
        .getOrElse { throw IllegalArgumentException("Invalid HI Acceptor settings JSON") }
      val written = appContext.reactContext!!.getSharedPreferences(HiAcceptorAccessibilityService.PREFS, Context.MODE_PRIVATE)
        .edit().putString("settings", json.toString()).commit()
      if (!written) throw IllegalStateException("Android did not commit HI Acceptor settings")
      HiAcceptorAccessibilityService.instance?.refreshConfiguration()
    }

    AsyncFunction("getStatus") {
      val prefs = appContext.reactContext!!.getSharedPreferences(HiAcceptorAccessibilityService.PREFS, Context.MODE_PRIVATE)
      val expected = "${appContext.reactContext?.packageName}/${HiAcceptorAccessibilityService::class.java.name}"
      val enabledServices = Settings.Secure.getString(appContext.reactContext!!.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: ""
      mapOf(
        "enabled" to prefs.getBoolean("operationEnabled", false),
        "accessibilityEnabled" to enabledServices.split(":").any { it.equals(expected, true) },
        "lastEvent" to (prefs.getString("lastEvent", null) ?: "No request processed yet"),
        "lastSeen" to (prefs.getString("lastSeen", null) ?: "Nothing seen from Jeeny yet"),
        "outcomeStats" to (prefs.getString("outcomeStats", "{}") ?: "{}")
      )
    }
  }
}
