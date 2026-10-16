import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";
import type { RideSettings } from "@/lib/ride-rules";

type NativeAcceptor = {
  isAccessibilityEnabled(): Promise<boolean>;
  openAccessibilitySettings(): Promise<void>;
  launchJeeny(): Promise<void>;
  setOperationEnabled(enabled: boolean): Promise<void>;
  saveSettings(settingsJson: string): Promise<void>;
  getStatus(): Promise<{ enabled: boolean; accessibilityEnabled: boolean; lastEvent?: string }>;
};

const native = (() => {
  if (Platform.OS !== "android") return undefined;
  try {
    return requireNativeModule<NativeAcceptor>("HiAcceptor");
  } catch {
    return undefined;
  }
})();
export const hasNativeAcceptor = Platform.OS === "android" && Boolean(native);

export async function isAccessibilityEnabled() {
  return hasNativeAcceptor ? native!.isAccessibilityEnabled() : false;
}

export async function openAccessibilitySettings() {
  if (hasNativeAcceptor) await native!.openAccessibilitySettings();
}

export async function setOperationEnabled(enabled: boolean) {
  if (hasNativeAcceptor) await native!.setOperationEnabled(enabled);
}

export async function launchJeeny() {
  if (hasNativeAcceptor) await native!.launchJeeny();
}

export async function saveNativeSettings(settings: RideSettings & { targetPackage: string }) {
  if (hasNativeAcceptor) await native!.saveSettings(JSON.stringify(settings));
}

export async function getNativeStatus() {
  return hasNativeAcceptor
    ? native!.getStatus()
    : { enabled: false, accessibilityEnabled: false, lastEvent: "Simulator only — Android Accessibility is unavailable in this preview." };
}
