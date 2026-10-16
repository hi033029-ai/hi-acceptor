import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AreaPicker } from "@/components/AreaPicker";
import { DEFAULT_SETTINGS, MAX_EXCLUDED_AREAS, createArea, loadSettings, saveSettings, type StoredSettings } from "@/lib/hi-acceptor-store";
import { saveNativeSettings } from "@/lib/hi-acceptor-native";
import type { AreaCircle } from "@/lib/ride-rules";

const ink = "#102532", muted = "#5E707A", teal = "#20B7A5", border = "#DDE6E4";
type Editing = { kind: "excluded" | "preferred"; existing?: AreaCircle };
export default function RulesScreen() {
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState({ latitude: 24.7136, longitude: 46.6753, radiusMeters: 1000 });
  const [zoneLabel, setZoneLabel] = useState("");
  useEffect(() => { void loadSettings().then(setSettings); }, []);
  const update = <K extends keyof StoredSettings>(key: K, value: StoredSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));
  const openAreaEditor = (kind: "excluded" | "preferred", existing?: AreaCircle) => {
    if (kind === "excluded" && !existing && settings.excludedAreas.length >= MAX_EXCLUDED_AREAS) return;
    const center = settings.region === "SA" ? { latitude: 24.7136, longitude: 46.6753 } : { latitude: 31.9539, longitude: 35.9106 };
    setEditing({ kind, existing });
    setDraft(existing ? { latitude: existing.latitude, longitude: existing.longitude, radiusMeters: existing.radiusMeters } : { ...center, radiusMeters: 1000 });
    setZoneLabel(existing?.label ?? "");
  };
  const saveAreaDraft = () => {
    if (draft.latitude < -90 || draft.latitude > 90 || draft.longitude < -180 || draft.longitude > 180 || draft.radiusMeters < 250 || draft.radiusMeters > 10000) {
      Alert.alert("Check this circle", "Center must be valid coordinates and radius must be 250 m–10 km."); return;
    }
    if (!editing) return;
    const created = createArea(draft.latitude, draft.longitude, draft.radiusMeters, zoneLabel);
    const area = { ...created, id: editing.existing?.id ?? created.id, names: editing.existing?.names ?? created.names };
    if (editing.kind === "excluded") {
      const next = editing.existing ? settings.excludedAreas.map((item) => item.id === editing.existing?.id ? area : item) : [...settings.excludedAreas, area];
      update("excludedAreas", next.slice(0, MAX_EXCLUDED_AREAS));
    } else update("preferredArea", area);
    setEditing(null);
  };
  const removeExcluded = (id: string) => update("excludedAreas", settings.excludedAreas.filter((area) => area.id !== id));
  const commit = async () => {
    if (!Number.isFinite(settings.minFare) || !Number.isFinite(settings.maxFare) || settings.minFare < 0 || settings.maxFare <= settings.minFare || settings.maxPickupMinutes <= 0) {
      Alert.alert("Set your fare and time limits", "Enter a minimum fare and a higher maximum fare. Pickup time must be more than zero."); return;
    }
    if (settings.excludedAreas.length > MAX_EXCLUDED_AREAS) { Alert.alert("Too many excluded areas", `Choose up to ${MAX_EXCLUDED_AREAS} excluded circles.`); return; }
    await saveSettings(settings);
    await saveNativeSettings({ ...settings, targetPackage: "me.com.easytaxista" });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };
  const currentArea = editing?.existing;
  const previewArea: AreaCircle = { id: currentArea?.id ?? "new-area", label: zoneLabel, ...draft };
  return <ScreenContainer containerClassName="bg-[#F3F6F5]" className="px-5 pt-4">
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={{ color: ink, fontSize: 27, fontWeight: "800" }}>Ride rules</Text>
      <Text style={{ color: muted, marginTop: 5, marginBottom: 17 }}>You choose both fare bounds and draw your own areas in HI Acceptor.</Text>
      <View style={card}>
        <Text style={title}>Your fare range · {settings.currency}</Text>
        <Field label="YOUR MINIMUM FARE" placeholder="Enter minimum" value={settings.minFare ? String(settings.minFare) : ""} onChange={(v) => update("minFare", v === "" ? 0 : Number(v))} />
        <Field label="YOUR MAXIMUM FARE" placeholder="Enter maximum" value={settings.maxFare ? String(settings.maxFare) : ""} onChange={(v) => update("maxFare", v === "" ? 0 : Number(v))} />
        <Field label="MAXIMUM PICKUP TIME (MINUTES)" value={String(settings.maxPickupMinutes)} onChange={(v) => update("maxPickupMinutes", Number(v) || 0)} />
        <Text style={helper}>There is no preset 12–80 range. Enter both values; the endpoints are included. Until a valid range is saved, automation stays off.</Text>
      </View>
      <View style={card}>
        <Text style={title}>Driver app to monitor</Text>
        <Text style={label}>THIS CHOICE ONLY SELECTS WHICH DRIVER APP TO MONITOR. YOUR AREAS ARE MANAGED BELOW IN HI ACCEPTOR.</Text>
        <View style={{ flexDirection: "row", gap: 9, marginTop: 8 }}>
          <Choice label="Jeeny Driver · Saudi Arabia · SAR" selected onPress={() => { update("targetApp", "jeeny"); update("region", "SA"); update("currency", "SAR"); }} />
        </View>
      </View>
      <View style={card}>
        <View style={rowBetween}><Text style={title}>Excluded circles</Text><Text style={{ color: teal, fontWeight: "800" }}>{settings.excludedAreas.length}/{MAX_EXCLUDED_AREAS}</Text></View>
        <Text style={helper}>Add up to five circles. Any Jeeny request inside an excluded circle will be skipped. Choose each circle in HI Acceptor; this does not open a map in Jeeny.</Text>
        {settings.excludedAreas.map((area) => <AreaRow key={area.id} area={area} onEdit={() => openAreaEditor("excluded", area)} onRemove={() => removeExcluded(area.id)} />)}
        {settings.excludedAreas.length < MAX_EXCLUDED_AREAS && <Action label="＋ Add excluded circle" onPress={() => openAreaEditor("excluded")} />}
      </View>
      <View style={card}>
        <View style={rowBetween}><Text style={title}>Preferred circle</Text><Text style={{ color: muted, fontSize: 11 }}>{settings.preferredArea ? "1/1" : "0/1"}</Text></View>
        <Text style={helper}>Choose one circle. A matching request is marked preferred; it never overrides fare, pickup, or exclusion rules. You can leave it unset.</Text>
        {settings.preferredArea ? <AreaRow area={settings.preferredArea} onEdit={() => openAreaEditor("preferred", settings.preferredArea!)} onRemove={() => update("preferredArea", null)} /> : <Action label="＋ Choose preferred circle" onPress={() => openAreaEditor("preferred")} />}
      </View>
      <View style={card}>
        <Text style={title}>Location matching and privacy</Text>
        <Text style={helper}>HI Acceptor compares destination coordinates with circles saved on this device. If Android cannot resolve a destination location, the request is skipped instead of guessed. The map loads OpenStreetMap tiles while you view it. Android system Geocoder may send the destination name to a device geocoding provider; use the privacy settings and OS controls you prefer.</Text>
      </View>
      <Pressable onPress={() => void commit()} style={{ backgroundColor: teal, paddingVertical: 16, borderRadius: 15, alignItems: "center" }}><Text style={{ color: "white", fontWeight: "800" }}>{saved ? "SAVED ON THIS DEVICE" : "SAVE RULES"}</Text></Pressable>
      <Text style={{ color: muted, marginTop: 14, fontSize: 12, lineHeight: 18 }}>No HI Acceptor account or activation is needed. Areas, fare rules, and status remain local.</Text>
    </ScrollView>
    {editing && <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "#F3F6F5", paddingHorizontal: 14, paddingTop: 48, paddingBottom: 12 }}>
      <View style={rowBetween}><Text style={{ color: ink, fontSize: 22, fontWeight: "800" }}>{editing.kind === "excluded" ? "Exclude an area" : "Preferred area"}</Text><Pressable onPress={() => setEditing(null)}><Text style={{ color: muted, fontSize: 16 }}>Cancel</Text></Pressable></View>
      <Text style={helper}>Move the map and tap to put the circle center. Set its radius from 250 m to 10 km.</Text>
      <View style={{ marginTop: 14, height: 350 }}><AreaPicker key={`${editing.kind}-${currentArea?.id ?? "new"}`} area={previewArea} region={settings.region} onChange={setDraft} /></View>
      <Text style={label}>AREA NAME (OPTIONAL)</Text>
      <TextInput value={zoneLabel} onChangeText={setZoneLabel} placeholder="e.g. Airport area" style={{ borderWidth: 1, borderColor: border, borderRadius: 12, padding: 12, marginTop: 6, color: ink, backgroundColor: "white" }} />
      <Pressable onPress={saveAreaDraft} style={{ marginTop: 14, backgroundColor: teal, paddingVertical: 15, borderRadius: 15, alignItems: "center" }}><Text style={{ color: "white", fontWeight: "800" }}>SAVE THIS CIRCLE</Text></Pressable>
    </View>}
  </ScreenContainer>;
}

const card = { backgroundColor: "white", borderRadius: 19, padding: 17, borderWidth: 1, borderColor: "#E2EAE8", marginBottom: 13 } as const;
const title = { color: ink, fontSize: 16, fontWeight: "800" as const };
const label = { color: muted, fontSize: 10, fontWeight: "800" as const, letterSpacing: 0.6, marginTop: 17 };
const helper = { color: muted, fontSize: 12, lineHeight: 18, marginTop: 8 };
const rowBetween = { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const };
function Field({ label: fieldLabel, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return <View><Text style={label}>{fieldLabel}</Text><TextInput value={value} placeholder={placeholder} onChangeText={onChange} keyboardType="decimal-pad" textAlignVertical="center" style={{ borderWidth: 1, borderColor: border, borderRadius: 12, padding: 12, marginTop: 7, color: ink }} /></View>;
}
function Choice({ label: choiceLabel, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 8, borderRadius: 12, borderColor: selected ? teal : border, borderWidth: 1, backgroundColor: selected ? "#E2F5F1" : "white", alignItems: "center" }}><Text style={{ color: selected ? "#087D70" : ink, fontSize: 12, fontWeight: "700", textAlign: "center" }}>{choiceLabel}</Text></Pressable>;
}
function Action({ label: actionLabel, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={{ marginTop: 12, padding: 13, alignItems: "center", borderRadius: 12, borderColor: teal, borderWidth: 1 }}><Text style={{ color: "#087D70", fontWeight: "800" }}>{actionLabel}</Text></Pressable>;
}
function AreaRow({ area, onEdit, onRemove }: { area: AreaCircle; onEdit: () => void; onRemove: () => void }) {
  return <View style={{ borderWidth: 1, borderColor: border, borderRadius: 12, padding: 12, marginTop: 10 }}><View style={rowBetween}><Text style={{ color: ink, fontWeight: "800" }}>{area.label || "Area"} · {area.radiusMeters >= 1000 ? `${(area.radiusMeters / 1000).toFixed(area.radiusMeters % 1000 ? 2 : 0)} km` : `${area.radiusMeters} m`}</Text></View><Text style={{ color: muted, fontSize: 11, marginTop: 4 }}>{area.latitude.toFixed(5)}, {area.longitude.toFixed(5)}</Text><View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}><Pressable onPress={onEdit}><Text style={{ color: "#087D70", fontWeight: "700" }}>Edit circle</Text></Pressable><Pressable onPress={onRemove}><Text style={{ color: "#A93D3D", fontWeight: "700" }}>Remove</Text></Pressable></View></View>;
}
