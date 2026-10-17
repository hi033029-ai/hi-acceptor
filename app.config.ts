// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Keep the generated Android package and deep-link scheme stable.
const rawBundleId = "space.manus.hiaccept.t152932280034126";
const bundleId = rawBundleId.replace(/[-_]/g, ".").replace(/[^a-zA-Z0-9.]/g, "").replace(/\.+/g, ".").replace(/^\.+|\.+$/g, "").toLowerCase().split(".").map((segment) => /^[a-zA-Z]/.test(segment) ? segment : `x${segment}`).join(".") || "space.manus.app";
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const scheme = `manus${timestamp}`;
const env = { appName: "HI Acceptor", appSlug: "hiaccept", logoUrl: "", scheme, bundleId };

const publicRuntime = {
  oauthPortalUrl: process.env.MANUS_OAUTH_PORTAL_URL ?? process.env.VITE_OAUTH_PORTAL_URL ?? process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ?? "",
  oauthServerUrl: process.env.MANUS_OAUTH_API_URL ?? process.env.OAUTH_SERVER_URL ?? process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ?? "",
  appId: process.env.MANUS_PROJECT_ID ?? process.env.VITE_APP_ID ?? process.env.EXPO_PUBLIC_APP_ID ?? "",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
};

const config: ExpoConfig = {
  name: env.appName, slug: env.appSlug, version: "1.0.2", extra: publicRuntime,
  orientation: "portrait", icon: "./assets/images/icon.png", scheme: env.scheme,
  userInterfaceStyle: "automatic",
  ios: { supportsTablet: true, bundleIdentifier: env.bundleId, infoPlist: { ITSAppUsesNonExemptEncryption: false } },
  android: {
    adaptiveIcon: { backgroundColor: "#102532", foregroundImage: "./assets/images/android-icon-foreground.png", backgroundImage: "./assets/images/android-icon-background.png", monochromeImage: "./assets/images/android-icon-monochrome.png" },
    predictiveBackGestureEnabled: false, package: env.bundleId, versionCode: 5, permissions: ["POST_NOTIFICATIONS", "ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
    config: { googleMaps: { apiKey: publicRuntime.googleMapsApiKey } },
    intentFilters: [{ action: "VIEW", autoVerify: true, data: [{ scheme: env.scheme, host: "*" }], category: ["BROWSABLE", "DEFAULT"] }],
  },
  web: { bundler: "metro", output: "static", favicon: "./assets/images/favicon.png" },
  plugins: ["expo-asset", "expo-router", "expo-location", "./plugins/withHiAcceptorAccessibility", ["expo-audio", { microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone." }], ["expo-video", { supportsBackgroundPlayback: true, supportsPictureInPicture: true }], ["expo-splash-screen", { image: "./assets/images/splash-icon.png", imageWidth: 200, resizeMode: "contain", backgroundColor: "#ffffff", dark: { backgroundColor: "#000000" } }], ["expo-build-properties", { android: { buildArchs: ["arm64-v8a"], minSdkVersion: 24 } }]],
  experiments: { typedRoutes: true, reactCompiler: true },
};
export default config;
