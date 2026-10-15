import { NativeModules, Platform } from "react-native";
import type { RideSettings } from "@/lib/ride-rules";

type NativeAcceptor = {
  isAccessibilityEnabled(): Promise<boolean>;
  openAccessibilitySettings(): Promise<void>;
  setOperationEnabled(enabled: boolean): Promise<void>;
  saveSettings(settings: RideSettings & { targetPackage: string }): Promise<void>;
  getStatus(): Promise<{ enabled: boolean; accessibilityEnabled: boolean; lastEvent?: string }>;
};

const native = NativeModules.HiAcceptor as NativeAcceptor | undefined;
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

export async function saveNativeSettings(settings: RideSettings & { targetPackage: string }) {
  if (hasNativeAcceptor) await native!.saveSettings(settings);
}

export async function getNativeStatus() {
  return hasNativeAcceptor
    ? native!.getStatus()
    : { enabled: false, accessibilityEnabled: false, lastEvent: "Simulator only — Android Accessibility is unavailable in this preview." };
}
