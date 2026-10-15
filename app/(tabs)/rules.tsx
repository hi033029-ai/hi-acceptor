import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type StoredSettings, type TargetApp } from "@/lib/hi-acceptor-store";
import { saveNativeSettings } from "@/lib/hi-acceptor-native";

const ink = "#102532", muted = "#5E707A", teal = "#20B7A5", border = "#DDE6E4";
export default function RulesScreen() {
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  useEffect(() => { void loadSettings().then(setSettings); }, []);
  const update = <K extends keyof StoredSettings>(key: K, value: StoredSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));
  const commit = async () => {
    if (settings.minFare < 0 || settings.maxFare <= settings.minFare || settings.maxPickupMinutes <= 0) {
      Alert.alert("Check your limits", "Maximum fare must be above minimum fare, and pickup time must be more than zero."); return;
    }
    await saveSettings(settings);
    await saveNativeSettings({ ...settings, targetPackage: settings.targetApp === "jeeny" ? "me.com.easytaxista" : "ee.mtakso.driver" });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };
  return <ScreenContainer containerClassName="bg-[#F3F6F5]" className="px-5 pt-4">
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={{ color: ink, fontSize: 27, fontWeight: "800" }}>Ride rules</Text>
      <Text style={{ color: muted, marginTop: 5, marginBottom: 17 }}>Requests outside these limits are skipped.</Text>
      <View style={card}>
        <Text style={title}>Fare range · {settings.currency}</Text>
        <Field label="Minimum fare" value={String(settings.minFare)} onChange={(v) => update("minFare", Number(v) || 0)} />
        <Field label="Maximum fare" value={String(settings.maxFare)} onChange={(v) => update("maxFare", Number(v) || 0)} />
        <Field label="Maximum pickup time (minutes)" value={String(settings.maxPickupMinutes)} onChange={(v) => update("maxPickupMinutes", Number(v) || 0)} />
        <Text style={helper}>The fare range is inclusive. Missing or unclear fare/pickup details always mean “skip.”</Text>
      </View>
      <View style={card}>
        <Text style={title}>Driver app</Text>
        <Text style={label}>SELECT APP</Text>
        <View style={{ flexDirection: "row", gap: 9, marginTop: 8 }}>
          <Choice label="Jeeny Driver" selected={settings.targetApp === "jeeny"} onPress={() => update("targetApp", "jeeny")} />
          <Choice label="Bolt Driver" selected={settings.targetApp === "bolt"} onPress={() => update("targetApp", "bolt")} />
        </View>
        <Text style={label}>REGION</Text>
        <View style={{ flexDirection: "row", gap: 9, marginTop: 8 }}>
          <Choice label="Saudi Arabia · SAR" selected={settings.region === "SA"} onPress={() => { update("region", "SA"); update("currency", "SAR"); }} />
          <Choice label="Jordan · JOD" selected={settings.region === "JO"} onPress={() => { update("region", "JO"); update("currency", "JOD"); }} />
        </View>
      </View>
      <View style={card}>
        <Text style={title}>Destination keywords</Text>
        <Text style={helper}>Enter one keyword per line. Exclusions always override preferred matches.</Text>
        <Field label="ALWAYS SKIP DESTINATIONS" multiline value={settings.excludedKeywords.join("\n")} onChange={(v) => update("excludedKeywords", v.split(/\n|,/).map((x) => x.trim()).filter(Boolean))} />
        <Field label="PREFERRED DESTINATIONS (ANNOTATION ONLY)" multiline value={settings.preferredKeywords.join("\n")} onChange={(v) => update("preferredKeywords", v.split(/\n|,/).map((x) => x.trim()).filter(Boolean))} />
      </View>
      <View style={card}>
        <Text style={title}>Example defaults</Text>
        <Text style={helper}>Seeded from the linked video: SAR 12–80, pickup ≤5 minutes, “Airport” and “مطار” excluded, “hamara” preferred. You can adjust all of these.</Text>
      </View>
      <Pressable onPress={() => void commit()} style={{ backgroundColor: teal, paddingVertical: 16, borderRadius: 15, alignItems: "center" }}><Text style={{ color: "white", fontWeight: "800" }}>{saved ? "SAVED ON THIS DEVICE" : "SAVE RULES"}</Text></Pressable>
      <Text style={{ color: muted, marginTop: 14, fontSize: 12, lineHeight: 18 }}>HI Acceptor does not need an account or activation. Your settings stay on this device.</Text>
    </ScrollView>
  </ScreenContainer>;
}

const card = { backgroundColor: "white", borderRadius: 19, padding: 17, borderWidth: 1, borderColor: "#E2EAE8", marginBottom: 13 } as const;
const title = { color: ink, fontSize: 16, fontWeight: "800" as const };
const label = { color: muted, fontSize: 10, fontWeight: "800" as const, letterSpacing: 0.6, marginTop: 17 };
const helper = { color: muted, fontSize: 12, lineHeight: 18, marginTop: 8 };
function Field({ label: fieldLabel, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return <View><Text style={label}>{fieldLabel}</Text><TextInput value={value} onChangeText={onChange} multiline={multiline} keyboardType={multiline ? "default" : "decimal-pad"} textAlignVertical={multiline ? "top" : "center"} style={{ borderWidth: 1, borderColor: border, borderRadius: 12, padding: 12, marginTop: 7, color: ink, minHeight: multiline ? 72 : undefined }} /></View>;
}
function Choice({ label: choiceLabel, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 8, borderRadius: 12, borderColor: selected ? teal : border, borderWidth: 1, backgroundColor: selected ? "#E2F5F1" : "white", alignItems: "center" }}><Text style={{ color: selected ? "#087D70" : ink, fontSize: 12, fontWeight: "700", textAlign: "center" }}>{choiceLabel}</Text></Pressable>;
}
