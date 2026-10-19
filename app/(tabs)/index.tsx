import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Alert, BackHandler, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { ScreenContainer } from "@/components/screen-container";
import { AreaPicker } from "@/components/AreaPicker";
import { ServiceStatusBanner } from "@/components/ServiceStatusBanner";
import { getNativeStatus, hasNativeAcceptor, isAccessibilityEnabled, launchJeeny, openAccessibilitySettings, openAppSettings, saveNativeSettings, setOperationEnabled } from "@/lib/hi-acceptor-native";
import { DEFAULT_SETTINGS, MAX_EXCLUDED_AREAS, createArea, loadOperationEnabled, loadSettings, saveOperationEnabled, saveSettings, type StoredSettings } from "@/lib/hi-acceptor-store";
import type { AreaCircle } from "@/lib/ride-rules";
import { languageNames, loadLanguage, saveLanguage, translations, type AppLanguage } from "@/lib/i18n";

const ink = "#102532";
const muted = "#5E707A";
const teal = "#20B7A5";
const tealDark = "#087D70";
const border = "#DDE6E4";
const red = "#B34842";
const supported = { jeeny: "me.com.easytaxista" } as const;

async function collectAreaNames(latitude: number, longitude: number, radiusMeters: number) {
  const offsets = [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]];
  const results = await Promise.all(offsets.map(async ([north, east]) => {
    const lat = latitude + (radiusMeters * north) / 111_320;
    const lng = longitude + (radiusMeters * east) / (111_320 * Math.max(0.2, Math.cos(latitude * Math.PI / 180)));
    return Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }).catch(() => []);
  }));
  const names = new Set<string>();
  for (const places of results) {
    for (const place of places) {
      for (const value of [place.name, place.street, place.district, place.subregion, place.city, place.region]) {
        if (value?.trim()) names.add(value.trim());
      }
    }
  }
  return [...names].slice(0, 40);
}

type PermissionState = { accessibility: boolean; foreground: boolean };

type EditingArea = { existing?: AreaCircle; draft: Pick<AreaCircle, "latitude" | "longitude" | "radiusMeters">; label: string };
type OutcomeDay = { accepted?: number; declined?: number };
type OutcomeStats = { lifetime?: OutcomeDay; days?: Record<string, OutcomeDay> };

function parseOutcomeStats(raw?: string): OutcomeStats {
  try { return raw ? JSON.parse(raw) as OutcomeStats : {}; } catch { return {}; }
}

export default function HomeScreen() {
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_SETTINGS);
  const [permissions, setPermissions] = useState<PermissionState>({ accessibility: false, foreground: false });
  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serviceStatus, setServiceStatus] = useState("No request processed yet");
  const [outcomeStats, setOutcomeStats] = useState<OutcomeStats>({});
  const [editingArea, setEditingArea] = useState<EditingArea | null>(null);
  const [language, setLanguage] = useState<AppLanguage | null>(null);
  const [languageDraft, setLanguageDraft] = useState<AppLanguage>("en");
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const text = translations[language ?? "en"];
  const liveServiceState = !hasNativeAcceptor || !permissions.accessibility
    ? "DISABLED"
    : !connected
      ? "ENABLED_BUT_NOT_CONNECTED"
      : enabled ? "RUNNING" : "CONNECTED";

  const queuePersist = (next: StoredSettings) => {
    const task = saveQueueRef.current.catch(() => undefined).then(async () => {
      await saveSettings(next);
      await saveNativeSettings({ ...next, targetPackage: supported[next.targetApp] });
    });
    saveQueueRef.current = task;
    return task;
  };

  const refresh = useCallback(async () => {
    await saveQueueRef.current.catch(() => undefined);
    const [stored, storedEnabled, accessibility, nativeStatus, foreground] = await Promise.all([
      loadSettings(), loadOperationEnabled(), isAccessibilityEnabled(), getNativeStatus(),
      Location.getForegroundPermissionsAsync().catch(() => ({ status: "denied" as const })),
    ]);
    setSettings(stored);
    setPermissions({ accessibility, foreground: foreground.status === "granted" });
    setConnected(hasNativeAcceptor && nativeStatus.connected);
    setEnabled(hasNativeAcceptor && accessibility && nativeStatus.connected && storedEnabled && nativeStatus.enabled);
    setServiceStatus(`${nativeStatus.connected ? "Accessibility Connected" : "Accessibility Disconnected"}\n${nativeStatus.lastEvent ?? "No request processed yet"}`);
    setOutcomeStats(parseOutcomeStats(nativeStatus.outcomeStats));
    if (hasNativeAcceptor) await saveNativeSettings({ ...stored, targetPackage: supported[stored.targetApp] });
  }, []);

  useEffect(() => {
    void loadLanguage().then((stored) => {
      if (stored) {
        setLanguage(stored);
        setLanguageDraft(stored);
      }
    });
    void refresh();
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    if (!hasNativeAcceptor) return;
    const id = setInterval(async () => {
      const status = await getNativeStatus().catch(() => null);
      if (status) {
        setConnected(hasNativeAcceptor && status.connected);
        setEnabled(hasNativeAcceptor && status.accessibilityEnabled && status.connected && status.enabled);
        setServiceStatus(`${status.connected ? "Accessibility Connected" : "Accessibility Disconnected"}\n${status.lastEvent ?? "No request processed yet"}\n${status.lastSeen ?? ""}`);
        setOutcomeStats(parseOutcomeStats(status.outcomeStats));
      }
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const continueWithLanguage = async () => {
    await saveLanguage(languageDraft);
    setLanguage(languageDraft);
  };

  useEffect(() => {
    if (!editingArea || Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setEditingArea(null);
      return true;
    });
    return () => subscription.remove();
  }, [editingArea]);

  const validRules = useMemo(() => settings.minFare >= 0 && settings.maxFare > settings.minFare && settings.maxPickupMinutes > 0, [settings]);
  const update = <K extends keyof StoredSettings>(key: K, value: StoredSettings[K]) => setSettings((current) => {
    const next = { ...current, [key]: value };
    void queuePersist(next).catch(() => undefined);
    return next;
  });

  const requestLocation = async () => {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.status !== "granted") {
      Alert.alert("Location permission required", "Allow location while using the app to center the exclusion map. Background location is not required for ride filtering.");
      await refresh();
      return false;
    }
    await refresh();
    return true;
  };

  const openAccessibility = async () => {
    if (!hasNativeAcceptor) {
      Alert.alert("Install the Android APK", "Accessibility settings can only be opened from the native ARM64 Android app. This web preview cannot control Android settings or other apps.");
      return;
    }
    await openAccessibilitySettings();
  };

  const save = async () => {
    if (!validRules) {
      Alert.alert("Complete your ride rules", "Set a minimum fare, a higher maximum fare, and a pickup-time limit before saving.");
      return false;
    }
    try {
      await queuePersist(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      return true;
    } catch {
      Alert.alert("Rules saved locally, Android sync failed", "Your rules are stored on this device, but the native Accessibility service did not receive them. Install the latest APK and try Save Rules again.");
      return false;
    }
  };

  const persistSettings = async (next: StoredSettings) => {
    setSettings(next);
    await queuePersist(next);
  };

  const toggleAutomation = async () => {
    if (enabled) {
      await saveOperationEnabled(false);
      await setOperationEnabled(false);
      setEnabled(false);
      return;
    }
    if (!hasNativeAcceptor) {
      Alert.alert("Install the Android APK", "Automation works only in the native ARM64 Android build, not in the web preview.");
      return;
    }
    if (!permissions.accessibility) {
      Alert.alert("Enable Accessibility", "On Xiaomi, allow restricted settings first if Android blocks this service. Then enable HI Acceptor ride request assistant under Downloaded apps.", [{ text: "Cancel", style: "cancel" }, { text: "Open settings", onPress: () => void openAccessibility() }]);
      return;
    }
    try {
      if (!permissions.foreground) {
        if (!(await requestLocation())) return;
      }
      if (!(await save())) return;
      if (Platform.OS === "android") await Notifications.requestPermissionsAsync().catch(() => undefined);
      await saveOperationEnabled(true);
      await setOperationEnabled(true);
      await launchJeeny();
      setEnabled(true);
    } catch (error) {
      await saveOperationEnabled(false).catch(() => undefined);
      await setOperationEnabled(false).catch(() => undefined);
      setEnabled(false);
      const detail = error instanceof Error ? error.message : String(error);
      Alert.alert("Could not start automation", `${detail || "The native Jeeny launch failed."}\n\nConfirm Jeeny Driver is installed, then try Start again.`);
    }
  };

  const beginAddArea = () => {
    if (settings.excludedAreas.length >= MAX_EXCLUDED_AREAS) {
      Alert.alert("Maximum reached", `You can exclude up to ${MAX_EXCLUDED_AREAS} map areas.`);
      return;
    }
    const center = settings.region === "SA" ? { latitude: 24.7136, longitude: 46.6753 } : { latitude: 31.9539, longitude: 35.9106 };
    setEditingArea({ draft: { ...center, radiusMeters: 1000 }, label: "" });
  };

  const saveArea = async () => {
    if (!editingArea) return;
    const { latitude, longitude, radiusMeters } = editingArea.draft;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || radiusMeters < 250 || radiusMeters > 10000) {
      Alert.alert("Invalid map area", "Choose a point on the map and keep the radius between 250 m and 10 km.");
      return;
    }
    const created = createArea(latitude, longitude, radiusMeters, editingArea.label || `Excluded area ${settings.excludedAreas.length + 1}`);
    created.names = await collectAreaNames(latitude, longitude, radiusMeters);
    const nextSettings = { ...settings, excludedAreas: [...settings.excludedAreas, created].slice(0, MAX_EXCLUDED_AREAS) };
    await persistSettings(nextSettings);
    setEditingArea(null);
  };

  const removeArea = async (id: string) => {
    await persistSettings({ ...settings, excludedAreas: settings.excludedAreas.filter((area) => area.id !== id) });
  };

  if (!language) return <WelcomeScreen selected={languageDraft} onSelect={setLanguageDraft} onContinue={() => void continueWithLanguage()} />;

  if (editingArea) {
    const preview: AreaCircle = { id: "new-area", label: editingArea.label, ...editingArea.draft };
    return <ScreenContainer containerClassName="bg-[#F3F6F5]" className="px-4 pt-3">
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={rowBetween}><View><Text style={brand}>{text.excludeTitle}</Text><Text style={subtitle}>{text.excludeSubtitle}</Text></View><Pressable onPress={() => setEditingArea(null)}><Text style={{ color: red, fontWeight: "800" }}>{text.cancel}</Text></Pressable></View>
        <View style={{ marginTop: 18 }}><AreaPicker key="new-exclusion" area={preview} region={settings.region} onChange={(point) => setEditingArea((current) => current ? { ...current, draft: point } : current)} /></View>
        <Text style={label}>EXCLUSION LABEL</Text>
        <TextInput value={editingArea.label} onChangeText={(label) => setEditingArea((current) => current ? { ...current, label } : current)} placeholder="e.g. Airport or downtown" style={input} />
        <Pressable onPress={saveArea} style={primaryButton}><Text style={primaryText}>{text.saveExcluded}</Text></Pressable>
      </ScrollView>
    </ScreenContainer>;
  }

  return <ScreenContainer containerClassName="bg-[#F3F6F5]" className="px-4 pt-3">
    <ScrollView contentContainerStyle={{ paddingBottom: 34 }} showsVerticalScrollIndicator={false}>
      <View style={{ marginBottom: 18 }}><Text style={brand}>HI Acceptor</Text><Text style={subtitle}>{text.homeSubtitle}</Text></View>

      <View style={{ backgroundColor: ink, borderRadius: 22, padding: 19, marginBottom: 12 }}>
        <View style={rowBetween}><View><Text style={{ color: "#A8C4C4", fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>{text.automation}</Text><Text style={{ color: "white", fontSize: 24, fontWeight: "800", marginTop: 5 }}>{enabled ? text.running : text.stopped}</Text></View><Pressable onPress={() => void toggleAutomation()} style={{ backgroundColor: enabled ? red : teal, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 18 }}><Text style={{ color: "white", fontWeight: "900" }}>{enabled ? text.stop : text.start}</Text></Pressable></View>
        <Text numberOfLines={6} style={{ color: connected ? "#C9DDDB" : "#FFB4A8", fontSize: 12, lineHeight: 17, marginTop: 13 }}>{serviceStatus}</Text>
        <View style={{ marginTop: 12 }}><ServiceStatusBanner status={liveServiceState} onReconnect={() => void openAccessibility()} onOpenSettings={() => void openAppSettings()} /></View>
      </View>

      <View style={card}><Text style={title}>{text.permissions}</Text><Text style={helper}>{text.permissionHelp} On Xiaomi, if Android shows “Restricted setting”, open Android Settings → Apps → HI Acceptor → the three-dot menu → Allow restricted settings, then return here and enable the service.</Text>
        <PermissionRow label={text.accessibility} granted={permissions.accessibility} action={() => void openAccessibility()} actionLabel={text.openSettings} />
        <PermissionRow label={text.locationForeground} granted={permissions.foreground} action={() => void requestLocation()} actionLabel={text.allow} />
        {hasNativeAcceptor && <Pressable onPress={() => void openAppSettings()} style={secondaryButton}><Text style={{ color: tealDark, fontWeight: "900" }}>OPEN HI ACCEPTOR APP SETTINGS</Text></Pressable>}
        <Text style={finePrint}>Accessibility reads Jeeny Driver while you use other apps. Foreground location is used only to center the exclusion map. You can revoke permissions in Android Settings.</Text>
      </View>

      <OutcomeCard stats={outcomeStats} />

      <View style={card}><Text style={title}>{text.rideCriteria}</Text><Text style={helper}>{text.criteriaHelp} Otherwise it is skipped or declined when the driver app exposes a clear decline control.</Text>
        <Text style={label}>{text.driverApp}</Text><View style={{ flexDirection: "row" }}><Choice label="Jeeny Driver" selected onPress={() => update("targetApp", "jeeny")} /></View>
        <Text style={label}>{text.regionCurrency}</Text><View style={{ flexDirection: "row" }}><Choice label="Saudi Arabia · SAR" selected onPress={() => { update("region", "SA"); update("currency", "SAR"); }} /></View>
        <Field label={`${text.minFare} (${settings.currency})`} value={settings.minFare ? String(settings.minFare) : ""} placeholder="0" onChange={(value) => update("minFare", Number(value) || 0)} />
        <Field label={`${text.maxFare} (${settings.currency})`} value={settings.maxFare ? String(settings.maxFare) : ""} placeholder="0" onChange={(value) => update("maxFare", Number(value) || 0)} />
        <Field label={text.maxPickup} value={String(settings.maxPickupMinutes)} placeholder="5" onChange={(value) => update("maxPickupMinutes", Number(value) || 0)} />
      </View>

      <View style={card}><View style={rowBetween}><Text style={title}>{text.exclude}</Text><Text style={{ color: tealDark, fontWeight: "900" }}>{settings.excludedAreas.length}/{MAX_EXCLUDED_AREAS}</Text></View><Text style={helper}>{text.excludeHelp}</Text>
        {settings.excludedAreas.map((area) => <View key={area.id} style={areaRow}><View style={rowBetween}><Text style={{ color: ink, fontWeight: "800", flex: 1 }}>{area.label}</Text><Pressable onPress={() => void removeArea(area.id)}><Text style={{ color: red, fontWeight: "800" }}>{text.remove}</Text></Pressable></View><Text style={{ color: muted, fontSize: 11, marginTop: 4 }}>{area.latitude.toFixed(5)}, {area.longitude.toFixed(5)} · {area.radiusMeters >= 1000 ? `${(area.radiusMeters / 1000).toFixed(area.radiusMeters % 1000 ? 1 : 0)} km` : `${area.radiusMeters} m`}</Text></View>)}
        <Pressable onPress={beginAddArea} style={secondaryButton}><Text style={{ color: tealDark, fontWeight: "900" }}>{text.chooseExcluded}</Text></Pressable>
      </View>

      <Pressable onPress={() => void save()} style={primaryButton}><Text style={primaryText}>{saved ? text.saved : text.saveRules}</Text></Pressable>
      <Text style={finePrint}>When started, the service reads the visible ride request in the selected driver app. It accepts only matching fare, pickup-time, currency, and destination rules. Unclear requests are never guessed.</Text>
    </ScrollView>
  </ScreenContainer>;
}

function WelcomeScreen({ selected, onSelect, onContinue }: { selected: AppLanguage; onSelect: (language: AppLanguage) => void; onContinue: () => void }) {
  const text = translations[selected];
  return <ScreenContainer containerClassName="bg-[#F3F6F5]" className="px-5 pt-10">
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingBottom: 28 }}>
      <Text style={brand}>HI Acceptor</Text>
      <Text style={[title, { fontSize: 25, marginTop: 18 }]}>{text.welcomeTitle}</Text>
      <Text style={[helper, { fontSize: 16, lineHeight: 25, marginTop: 10 }]}>{text.welcomeBody}</Text>
      <Text style={[label, { marginTop: 30 }]}>{text.chooseLanguage}</Text>
      {(["en", "ar", "ur"] as AppLanguage[]).map((item) => <Pressable key={item} onPress={() => onSelect(item)} style={{ borderWidth: 1, borderColor: selected === item ? teal : border, backgroundColor: selected === item ? "#E2F5F1" : "white", borderRadius: 13, padding: 16, marginTop: 10 }}><Text style={{ color: ink, fontWeight: "800", textAlign: item === "ar" || item === "ur" ? "right" : "left" }}>{languageNames[item]}</Text></Pressable>)}
      <Pressable onPress={onContinue} style={[primaryButton, { marginTop: 26 }]}><Text style={primaryText}>{text.continue}</Text></Pressable>
    </ScrollView>
  </ScreenContainer>;
}

function OutcomeCard({ stats }: { stats: OutcomeStats }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    return { key, label: `${date.getDate()}/${date.getMonth() + 1}`, ...(stats.days?.[key] ?? {}) };
  }), [stats]);
  const lifetime = stats.lifetime ?? {};
  const max = Math.max(1, ...days.map((day) => (day.accepted ?? 0) + (day.declined ?? 0)));
  return <View style={card}><Text style={title}>Ride decisions</Text><Text style={helper}>Only completed accept or decline actions are counted. Skipped offers and repeated screen events are not counted.</Text>
    <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}><View style={statBox}><Text style={statNumber}>{lifetime.accepted ?? 0}</Text><Text style={statLabel}>Accepted total</Text></View><View style={statBox}><Text style={[statNumber, { color: red }]}>{lifetime.declined ?? 0}</Text><Text style={statLabel}>Declined total</Text></View></View>
    <Text style={[label, { marginTop: 18 }]}>LAST 7 DAYS</Text><View style={{ height: 92, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 6 }}>{days.map((day) => { const acceptedHeight = ((day.accepted ?? 0) / max) * 62; const declinedHeight = ((day.declined ?? 0) / max) * 62; return <View key={day.key} style={{ flex: 1, alignItems: "center" }}><View style={{ height: 66, flexDirection: "row", alignItems: "flex-end", gap: 2 }}><View style={{ width: 7, height: Math.max(day.accepted ? 4 : 0, acceptedHeight), backgroundColor: teal, borderRadius: 4 }} /><View style={{ width: 7, height: Math.max(day.declined ? 4 : 0, declinedHeight), backgroundColor: red, borderRadius: 4 }} /></View><Text style={{ color: muted, fontSize: 9, marginTop: 4 }}>{day.label}</Text></View>; })}</View><View style={{ flexDirection: "row", gap: 14, marginTop: 8 }}><Text style={{ color: tealDark, fontSize: 10, fontWeight: "800" }}>● ACCEPTED</Text><Text style={{ color: red, fontSize: 10, fontWeight: "800" }}>● DECLINED</Text></View>
  </View>;
}

function PermissionRow({ label: rowLabel, granted, action, actionLabel }: { label: string; granted: boolean; action: () => void; actionLabel: string }) {
  return <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 11, borderTopWidth: 1, borderTopColor: border }}><View style={{ flex: 1 }}><Text style={{ color: ink, fontWeight: "700" }}>{rowLabel}</Text><Text style={{ color: granted ? tealDark : red, fontSize: 11, marginTop: 3, fontWeight: "800" }}>{granted ? "GRANTED" : "NOT GRANTED"}</Text></View>{!granted && <Pressable onPress={action} style={{ borderWidth: 1, borderColor: teal, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 11 }}><Text style={{ color: tealDark, fontSize: 11, fontWeight: "900" }}>{actionLabel}</Text></Pressable>}</View>;
}
function Field({ label: fieldLabel, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) { return <View><Text style={label}>{fieldLabel}</Text><TextInput value={value} placeholder={placeholder} onChangeText={onChange} keyboardType="decimal-pad" style={input} /></View>; }
function Choice({ label: choiceLabel, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={{ flex: 1, borderWidth: 1, borderColor: selected ? teal : border, backgroundColor: selected ? "#E2F5F1" : "white", borderRadius: 11, paddingVertical: 11, alignItems: "center" }}><Text style={{ color: selected ? tealDark : ink, fontSize: 12, fontWeight: "800", textAlign: "center" }}>{choiceLabel}</Text></Pressable>; }

const card = { backgroundColor: "white", borderRadius: 19, padding: 16, borderWidth: 1, borderColor: "#E2EAE8", marginBottom: 12 } as const;
const brand = { color: ink, fontSize: 27, fontWeight: "900" as const, letterSpacing: -0.6 };
const subtitle = { color: muted, fontSize: 13, marginTop: 4, lineHeight: 18 };
const title = { color: ink, fontSize: 17, fontWeight: "900" as const };
const helper = { color: muted, fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 6 };
const finePrint = { color: muted, fontSize: 11, lineHeight: 16, marginTop: 11 };
const label = { color: muted, fontSize: 10, fontWeight: "900" as const, letterSpacing: 0.7, marginTop: 14, marginBottom: 6 };
const input = { borderWidth: 1, borderColor: border, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11, color: ink, fontSize: 15, backgroundColor: "white" } as const;
const rowBetween = { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const };
const areaRow = { borderWidth: 1, borderColor: border, borderRadius: 11, padding: 11, marginTop: 8 } as const;
const primaryButton = { backgroundColor: teal, borderRadius: 14, paddingVertical: 15, alignItems: "center" as const, marginBottom: 12 };
const secondaryButton = { borderWidth: 1, borderColor: teal, borderRadius: 12, paddingVertical: 13, alignItems: "center" as const, marginTop: 12 };
const primaryText = { color: "white", fontWeight: "900" as const, letterSpacing: 0.2 };
const statBox = { flex: 1, backgroundColor: "#F3F8F7", borderRadius: 12, padding: 11 } as const;
const statNumber = { color: tealDark, fontSize: 22, fontWeight: "900" as const };
const statLabel = { color: muted, fontSize: 10, marginTop: 2 } as const;
