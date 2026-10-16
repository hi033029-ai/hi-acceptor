import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AreaCircle, RideSettings } from "@/lib/ride-rules";

export type TargetApp = "jeeny";
export type StoredSettings = RideSettings & { targetApp: TargetApp; region: "SA" };
export type ActivityItem = { id: string; at: string; accepted: boolean; reason: string; fare?: number; destination?: string };

export const MAX_EXCLUDED_AREAS = 5;
export const DEFAULT_SETTINGS: StoredSettings = {
  minFare: 0,
  maxFare: 0,
  maxPickupMinutes: 5,
  currency: "SAR",
  excludedAreas: [],
  preferredArea: null,
  targetApp: "jeeny",
  region: "SA",
};

const SETTINGS_KEY = "hiaccept.settings.v2";
const ACTIVITY_KEY = "hiaccept.activity.v1";
const ENABLED_KEY = "hiaccept.enabled.v1";

function normalizeAreas(settings: StoredSettings): StoredSettings {
  return {
    ...settings,
    targetApp: "jeeny",
    region: "SA",
    currency: "SAR",
    excludedAreas: Array.isArray(settings.excludedAreas) ? settings.excludedAreas.slice(0, MAX_EXCLUDED_AREAS) : [],
    preferredArea: settings.preferredArea ?? null,
  };
}

export async function loadSettings(): Promise<StoredSettings> {
  try {
    const stored = await AsyncStorage.getItem(SETTINGS_KEY);
    return stored ? normalizeAreas({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) }) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: StoredSettings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeAreas(settings)));
}

export function createArea(latitude: number, longitude: number, radiusMeters: number, label: string): AreaCircle {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label: label.trim() || "Area", latitude, longitude, radiusMeters };
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
