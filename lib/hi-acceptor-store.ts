import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RideSettings } from "@/lib/ride-rules";

export type TargetApp = "jeeny" | "bolt";
export type StoredSettings = RideSettings & { targetApp: TargetApp; region: "SA" | "JO" };
export type ActivityItem = { id: string; at: string; accepted: boolean; reason: string; fare?: number; destination?: string };

export const DEFAULT_SETTINGS: StoredSettings = {
  minFare: 12,
  maxFare: 80,
  maxPickupMinutes: 5,
  currency: "SAR",
  excludedKeywords: ["Airport", "مطار"],
  preferredKeywords: ["hamara"],
  targetApp: "jeeny",
  region: "SA",
};

const SETTINGS_KEY = "hiaccept.settings.v1";
const ACTIVITY_KEY = "hiaccept.activity.v1";
const ENABLED_KEY = "hiaccept.enabled.v1";

export async function loadSettings(): Promise<StoredSettings> {
  try {
    const stored = await AsyncStorage.getItem(SETTINGS_KEY);
    return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: StoredSettings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function loadActivity(): Promise<ActivityItem[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(ACTIVITY_KEY)) ?? "[]");
  } catch {
    return [];
  }
}

export async function addActivity(item: ActivityItem) {
  const current = await loadActivity();
  await AsyncStorage.setItem(ACTIVITY_KEY, JSON.stringify([item, ...current].slice(0, 50)));
}

export async function clearActivity() {
  await AsyncStorage.removeItem(ACTIVITY_KEY);
}

export async function loadOperationEnabled() {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === "true";
}

export async function saveOperationEnabled(enabled: boolean) {
  await AsyncStorage.setItem(ENABLED_KEY, String(enabled));
}
