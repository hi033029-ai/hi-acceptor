import { AndroidConfig, withAndroidManifest, withDangerousMod, type ConfigPlugin } from "@expo/config-plugins";
import fs from "node:fs";
import path from "node:path";

const SERVICE_NAME = "com.hiacceptor.HiAcceptorAccessibilityService";

const withHiAcceptorAccessibility: ConfigPlugin = (config) => {
  config = withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    app.service ??= [];
    const existing = app.service.find((service) => service.$?.["android:name"] === SERVICE_NAME);
    const service = {
      $: {
        "android:name": SERVICE_NAME,
        "android:label": "HI Acceptor ride request assistant",
        "android:permission": "android.permission.BIND_ACCESSIBILITY_SERVICE",
        "android:exported": "true" as const,
      },
      "intent-filter": [{ action: [{ $: { "android:name": "android.accessibilityservice.AccessibilityService" } }] }],
      "meta-data": [{ $: { "android:name": "android.accessibilityservice", "android:resource": "@xml/hi_acceptor_accessibility_service" } }],
    };
    if (existing) Object.assign(existing, service);
    else app.service.push(service);
    return mod;
  });

  return withDangerousMod(config, ["android", async (mod) => {
    const resDir = path.join(mod.modRequest.platformProjectRoot, "app/src/main/res/xml");
    fs.mkdirSync(resDir, { recursive: true });
    fs.writeFileSync(path.join(resDir, "hi_acceptor_accessibility_service.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android" android:accessibilityEventTypes="typeWindowContentChanged|typeWindowStateChanged" android:accessibilityFeedbackType="feedbackGeneric" android:notificationTimeout="100" android:canRetrieveWindowContent="true" android:canPerformGestures="true" android:description="Reads visible ride request details in the driver app you selected, applies your rules, and may tap its accept control only when all required details are clear." android:packageNames="me.com.easytaxista,ee.mtakso.driver" />\n`);
    return mod;
  }]);
};

export default withHiAcceptorAccessibility;
