import { AndroidConfig, withAndroidManifest, withDangerousMod, type ConfigPlugin } from "@expo/config-plugins";
import fs from "node:fs";
import path from "node:path";

const SERVICE_NAME = "com.hiacceptor.HiAcceptorAccessibilityService";

const withHiAcceptorAccessibility: ConfigPlugin = (config) => {
  config = withAndroidManifest(config, (mod) => {
    mod.modResults.manifest.queries ??= [];
    const queries = mod.modResults.manifest.queries;
    const hasJeenyQuery = queries.some((query) => query.package?.some((entry) => entry.$["android:name"] === "me.com.easytaxista"));
    if (!hasJeenyQuery) {
      const queryBlock = queries[0] ?? {};
      queryBlock.package ??= [];
      queryBlock.package.push({ $: { "android:name": "me.com.easytaxista" } });
      if (!queries.length) queries.push(queryBlock);
    }
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
    fs.writeFileSync(path.join(resDir, "hi_acceptor_accessibility_service.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android" android:accessibilityEventTypes="typeWindowContentChanged|typeWindowStateChanged|typeWindowsChanged|typeViewClicked|typeViewScrolled|typeViewTextChanged|typeViewFocused" android:accessibilityFeedbackType="feedbackGeneric" android:accessibilityFlags="flagDefault|flagIncludeNotImportantViews|flagReportViewIds" android:notificationTimeout="200" android:canRetrieveWindowContent="true" android:canPerformGestures="true" android:packageNames="me.com.easytaxista" />\n`);
    return mod;
  }]);
};

export default withHiAcceptorAccessibility;
