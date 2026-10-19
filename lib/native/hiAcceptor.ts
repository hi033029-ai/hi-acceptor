import {
  getNativeStatus,
  hasNativeAcceptor,
  isAccessibilityEnabled,
  launchJeeny,
  openAccessibilitySettings,
  openAppSettings,
  saveNativeSettings,
  setOperationEnabled,
} from "@/lib/hi-acceptor-native";

export type ServiceState =
  | "DISABLED"
  | "ENABLED_BUT_NOT_CONNECTED"
  | "CONNECTED"
  | "RUNNING"
  | "ERROR";

export type NativeStatus = {
  enabled: boolean;
  connected: boolean;
  accessibilityEnabled: boolean;
  lastEvent?: string;
  lastSeen?: string;
  outcomeStats?: string;
};

export { hasNativeAcceptor, isAccessibilityEnabled, openAccessibilitySettings, openAppSettings, launchJeeny, setOperationEnabled, saveNativeSettings, getNativeStatus };

export async function getLiveServiceState(): Promise<ServiceState> {
  if (!hasNativeAcceptor) return "DISABLED";
  try {
    const status = await getNativeStatus();
    if (!status.accessibilityEnabled) return "DISABLED";
    if (!status.connected) return "ENABLED_BUT_NOT_CONNECTED";
    return status.enabled ? "RUNNING" : "CONNECTED";
  } catch {
    return "ERROR";
  }
}

export async function setAutomationEnabled(enabled: boolean): Promise<void> {
  await setOperationEnabled(enabled);
}
