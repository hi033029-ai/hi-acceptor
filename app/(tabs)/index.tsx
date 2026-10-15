import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { evaluateRide, type Decision } from "@/lib/ride-rules";
import { DEFAULT_SETTINGS, addActivity, loadActivity, loadOperationEnabled, loadSettings, saveOperationEnabled, type ActivityItem, type StoredSettings } from "@/lib/hi-acceptor-store";
import { getNativeStatus, hasNativeAcceptor, isAccessibilityEnabled, openAccessibilitySettings, saveNativeSettings, setOperationEnabled } from "@/lib/hi-acceptor-native";

const colors = { ink: "#102532", muted: "#5E707A", paper: "#F3F6F5", card: "#FFFFFF", teal: "#20B7A5", line: "#DDE6E4", amber: "#A56512", red: "#B34842" };
const supported = { jeeny: "me.com.easytaxista", bolt: "ee.mtakso.driver" } as const;

export default function HomeScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_SETTINGS);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState(false);
  const [nativeStatus, setNativeStatus] = useState("Checking native status…");
  const [fare, setFare] = useState("24");
  const [pickup, setPickup] = useState("4");
  const [destination, setDestination] = useState("City Center");
  const [decision, setDecision] = useState<Decision | null>(null);

  const refresh = useCallback(async () => {
    const [storedSettings, items, storedEnabled, accessibility, status] = await Promise.all([
      loadSettings(), loadActivity(), loadOperationEnabled(), isAccessibilityEnabled(), getNativeStatus(),
    ]);
    setSettings(storedSettings);
    setActivity(items);
    setPermission(accessibility);
    setEnabled(hasNativeAcceptor && accessibility && storedEnabled && status.enabled);
    setNativeStatus(hasNativeAcceptor ? (status.lastEvent ?? "No request processed yet") : "Simulator only · Native Android build required to use Accessibility");
    if (hasNativeAcceptor) await saveNativeSettings({ ...storedSettings, targetPackage: supported[storedSettings.targetApp] });
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const simulated = useMemo(() => evaluateRide({ fare: Number(fare), currency: settings.currency, pickupMinutes: Number(pickup), destination, text: "Preview" }, settings), [fare, pickup, destination, settings]);

  const toggleOperation = async () => {
    if (!hasNativeAcceptor) {
      Alert.alert("Android build required", "The web preview is a simulator. Install a native Android build and enable HI Acceptor in Android Accessibility settings before starting auto-accept.");
      return;
    }
    if (!permission) {
      Alert.alert("Permission needed", "Enable the HI Acceptor Accessibility service in Android Settings. It is used only for the driver app you selected.", [
        { text: "Not now", style: "cancel" }, { text: "Open settings", onPress: () => { void openAccessibilitySettings(); } },
      ]);
      return;
    }
    const next = !enabled;
    if (next && Platform.OS === "android") {
      try { await Notifications.requestPermissionsAsync(); } catch { /* Alerts are optional; operation does not depend on them. */ }
    }
    await saveOperationEnabled(next);
    await setOperationEnabled(next);
    setEnabled(next);
  };

  const runSimulation = async () => {
    setDecision(simulated);
    const record: ActivityItem = {
      id: `${Date.now()}`, at: new Date().toISOString(), accepted: simulated.eligible,
      reason: `Simulator: ${simulated.reason}`, fare: Number(fare), destination,
    };
    await addActivity(record);
    setActivity((previous) => [record, ...previous].slice(0, 50));
  };

  return (
    <ScreenContainer containerClassName="bg-[#F3F6F5]" className="px-5 pt-3">
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <View>
            <Text style={{ color: colors.ink, fontSize: 27, fontWeight: "800", letterSpacing: -0.7 }}>HI Acceptor</Text>
            <Text style={{ color: colors.muted, fontSize: 13, marginTop: 3 }}>Your rules. Your choice.</Text>
          </View>
          <View style={{ backgroundColor: "#DDF5F1", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20 }}>
            <Text style={{ color: "#087D70", fontSize: 12, fontWeight: "700" }}>FREE · ON-DEVICE</Text>
          </View>
        </View>

        <View style={{ backgroundColor: colors.ink, borderRadius: 24, padding: 22, marginBottom: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text style={{ color: "#A8C4C4", fontSize: 12, fontWeight: "700", letterSpacing: 1 }}>AUTOMATION</Text>
              <Text style={{ color: "white", fontSize: 23, fontWeight: "800", marginTop: 7 }}>{enabled ? "Active" : "Stopped"}</Text>
            </View>
            <Pressable onPress={() => void toggleOperation()} accessibilityRole="switch" accessibilityState={{ checked: enabled }} style={{ backgroundColor: enabled ? colors.teal : "#40545D", borderRadius: 24, paddingVertical: 13, paddingHorizontal: 19 }}>
              <Text style={{ color: "white", fontSize: 14, fontWeight: "800" }}>{enabled ? "STOP" : "START"}</Text>
            </Pressable>
          </View>
          <Text style={{ color: "#C8D7D8", lineHeight: 20, fontSize: 13, marginTop: 15 }}>
            {enabled ? `Watching ${settings.targetApp === "jeeny" ? "Jeeny Driver" : "Bolt Driver"}. Stop any time.` : "Automation stays off until you explicitly enable Android Accessibility and press Start."}
          </Text>
          <View style={{ height: 1, backgroundColor: "#42555D", marginVertical: 15 }} />
          <Text style={{ color: permission ? "#80E3D3" : "#FFD28A", fontSize: 12, fontWeight: "700" }}>
            {hasNativeAcceptor ? (permission ? "ACCESSIBILITY PERMISSION ON" : "ACCESSIBILITY PERMISSION OFF") : "PREVIEW MODE · SIMULATOR ONLY"}
          </Text>
          {!permission && hasNativeAcceptor && <Pressable onPress={() => void openAccessibilitySettings()} style={{ marginTop: 10 }}><Text style={{ color: "#A9EDE4", fontWeight: "700" }}>Open Android Accessibility settings →</Text></Pressable>}
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
          <Metric label="FARE RANGE" value={`${settings.currency} ${settings.minFare}–${settings.maxFare}`} />
          <Metric label="PICKUP LIMIT" value={`${settings.maxPickupMinutes} min`} />
        </View>

        <View style={card}>
          <View style={rowBetween}><Text style={heading}>Rule preview</Text><Text style={{ color: colors.muted, fontSize: 12 }}>No real ride is tapped here</Text></View>
          <Text style={label}>FARE ({settings.currency})</Text>
          <TextInput value={fare} onChangeText={setFare} keyboardType="decimal-pad" style={input} accessibilityLabel="Simulator fare" />
          <Text style={label}>PICKUP TIME (MINUTES)</Text>
          <TextInput value={pickup} onChangeText={setPickup} keyboardType="decimal-pad" style={input} accessibilityLabel="Simulator pickup time" />
          <Text style={label}>DESTINATION</Text>
          <TextInput value={destination} onChangeText={setDestination} style={input} accessibilityLabel="Simulator destination" />
          <Pressable onPress={() => void runSimulation()} style={{ backgroundColor: colors.teal, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 5 }}>
            <Text style={{ color: "white", fontWeight: "800" }}>CHECK MY RULES</Text>
          </Pressable>
          {decision && <View style={{ backgroundColor: decision.eligible ? "#E2F5F1" : "#FFF0ED", padding: 13, borderRadius: 12, marginTop: 12 }}>
            <Text style={{ color: decision.eligible ? "#087D70" : colors.red, fontWeight: "800" }}>{decision.eligible ? "MATCH" : "DO NOT ACCEPT"}{decision.preferred ? " · PREFERRED" : ""}</Text>
            <Text style={{ color: colors.ink, marginTop: 4 }}>{decision.reason}</Text>
          </View>}
        </View>

        <View style={card}>
          <View style={rowBetween}><Text style={heading}>Your rules</Text><Pressable onPress={() => router.push("/rules")}><Text style={{ color: "#087D70", fontWeight: "700" }}>Settings →</Text></Pressable></View>
          <RuleLine title="Selected app" detail={`${settings.targetApp === "jeeny" ? "Jeeny Driver" : "Bolt Driver"} · ${settings.region === "SA" ? "Saudi Arabia" : "Jordan"}`} />
          <RuleLine title="Excluded destinations" detail={settings.excludedKeywords.join(" · ") || "None"} />
          <RuleLine title="Preferred destinations" detail={settings.preferredKeywords.join(" · ") || "None · preference never overrides safety rules"} />
        </View>

        <View style={card}>
          <View style={rowBetween}><Text style={heading}>On-device activity</Text><Text style={{ color: colors.muted, fontSize: 12 }}>Last 50</Text></View>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{nativeStatus}</Text>
          {activity.length === 0 ? <Text style={{ color: colors.muted, marginTop: 14 }}>No requests checked yet. Simulator checks appear here.</Text> : activity.slice(0, 4).map((item) => <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 11, marginTop: 11 }}><Text style={{ color: item.accepted ? "#087D70" : colors.red, fontWeight: "700" }}>{item.accepted ? "MATCH" : "SKIPPED"} · {item.reason}</Text><Text style={{ color: colors.muted, marginTop: 3 }}>{item.destination ?? "Destination unavailable"}{item.fare !== undefined ? ` · ${settings.currency} ${item.fare}` : ""}</Text></View>)}
        </View>
        <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginHorizontal: 4, marginTop: 2 }}>Screen text is processed on this phone and is not sent to HI Acceptor servers. Accessibility access can read screen content and tap controls in the selected driver app. Review the app’s rules before turning automation on.</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const card = { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 17, marginBottom: 13, borderWidth: 1, borderColor: "#E2EAE8" } as const;
const heading = { color: colors.ink, fontSize: 16, fontWeight: "800" as const };
const rowBetween = { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const };
const label = { color: colors.muted, fontSize: 10, fontWeight: "800" as const, letterSpacing: 0.8, marginTop: 13, marginBottom: 6 };
const input = { borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: colors.ink, fontSize: 15 } as const;

function Metric({ label: metricLabel, value }: { label: string; value: string }) {
  return <View style={{ flex: 1, backgroundColor: "#FFFFFF", borderRadius: 17, borderColor: colors.line, borderWidth: 1, padding: 15 }}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.6 }}>{metricLabel}</Text><Text style={{ color: colors.ink, fontSize: 16, fontWeight: "800", marginTop: 6 }}>{value}</Text></View>;
}
function RuleLine({ title, detail }: { title: string; detail: string }) {
  return <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 11, marginTop: 11 }}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700" }}>{title}</Text><Text style={{ color: colors.ink, fontSize: 14, marginTop: 3 }}>{detail}</Text></View>;
}
