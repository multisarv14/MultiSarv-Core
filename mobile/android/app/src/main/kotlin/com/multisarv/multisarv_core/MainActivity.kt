package com.multisarv.multisarv_core

import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "multisarv/calls").setMethodCallHandler { call, result ->
            when (call.method) {
                "clearOngoing" -> {
                    clearOngoing()
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }

    /// Call samplela pan `flutter_callkit_incoming` cha "ongoing call" service / notification
    /// atakla (tyachya active-calls list madhe call nahi) — thet band kara.
    private fun clearOngoing() {
        try {
            stopService(Intent().setClassName(packageName, "com.hiennv.flutter_callkit_incoming.CallkitNotificationService"))
        } catch (_: Exception) {}
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java) ?: return
            for (n in nm.activeNotifications) {
                if (n.notification.channelId == "callkit_ongoing_channel_id") nm.cancel(n.tag, n.id)
            }
        }
    }
}
