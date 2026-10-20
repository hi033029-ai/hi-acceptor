// Load environment variables with proper priority (system > .env)
import type { ExpoConfig } from "expo/config";

// Keep the generated Android package and deep-link scheme stable.
const rawBundleId = "space.manus.hiaccept.t152932280034126";
const bundleId = rawBundleId.replace(/[-_]/g, ".").replace(/[^a-zA-Z0-9.]/g, "").replace(/\.+/g, ".").replace(/^\.+|\.+$/g, "").toLowerCase().split(".").map((segment) => /^[a-zA-Z]/.test(segment) ? segment : `x${segment}`).join(".") || "space.manus.app";
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const scheme = `manus${timestamp}`;
const env = { appName: "HI Acceptor", appSlug: "hiaccept", logoUrl: "", scheme, bundleId };

const publicRuntime = {
  oauthPortalUrl: "",
  oauthServerUrl: "",
  appId: "",
  apiBaseUrl: "",
};

const config: ExpoConfig = {
  name: env.appName, slug: env.appSlug, version: "1.0.4", extra: publicRuntime,
  orientation: "portrait", icon: "./assets/images/icon.png", scheme: env.scheme,
  userInterfaceStyle: "automatic",
  ios: { supportsTablet: true, bundleIdentifier: env.bundleId, infoPlist: { ITSAppUsesNonExemptEncryption: false } },
  android: {
    adaptiveIcon: { backgroundColor: "#102532", foregroundImage: "./assets/images/android-icon-foreground.png", backgroundImage: "./assets/images/android-icon-background.png", monochromeImage: "./assets/images/android-icon-monochrome.png" },
    predictiveBackGestureEnabled: false, package: "com.hiacceptor.pk", versionCode: 11, permissions: ["POST_NOTIFICATIONS", "ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
    intentFilters: [{ action: "VIEW", autoVerify: true, data: [{ scheme: env.scheme, host: "*" }], category: ["BROWSABLE", "DEFAULT"] }],
  },
  web: { bundler: "metro", output: "static", favicon: "./assets/images/favicon.png" },
  plugins: ["expo-asset", "expo-router", "expo-location", "./plugins/withHiAcceptorAccessibility", ["expo-splash-screen", { image: "./assets/images/splash-icon.png", imageWidth: 200, resizeMode: "contain", backgroundColor: "#ffffff", dark: { backgroundColor: "#000000" } }], ["expo-build-properties", { android: { buildArchs: ["arm64-v8a"], minSdkVersion: 24 } }]],
  experiments: { typedRoutes: true, reactCompiler: true },
};
export default config;
