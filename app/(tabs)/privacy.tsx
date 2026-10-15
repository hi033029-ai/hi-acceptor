import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { clearActivity, loadActivity } from "@/lib/hi-acceptor-store";
import { hasNativeAcceptor, openAccessibilitySettings } from "@/lib/hi-acceptor-native";

const ink = "#102532", muted = "#5E707A", teal = "#20B7A5";
export default function PrivacyScreen() {
  const [count, setCount] = useState(0);
  useEffect(() => { void loadActivity().then((items) => setCount(items.length)); }, []);
  const clear = async () => {
    const remove = async () => { await clearActivity(); setCount(0); };
    if (Platform.OS === "web") { if (window.confirm("Clear locally saved activity?")) await remove(); }
    else Alert.alert("Clear activity?", "This removes HI Acceptor’s local request history.", [{ text: "Cancel", style: "cancel" }, { text: "Clear", style: "destructive", onPress: () => void remove() }]);
  };
  return <ScreenContainer containerClassName="bg-[#F3F6F5]" className="px-5 pt-4"><ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
    <Text style={{ color: ink, fontSize: 27, fontWeight: "800" }}>Privacy & access</Text>
    <Text style={{ color: muted, marginTop: 5, marginBottom: 17 }}>Clear about what the app can and cannot do.</Text>
    <View style={card}><Text style={title}>Your data stays here</Text><Text style={body}>HI Acceptor stores your rules and recent status locally on this phone. It has no login, activation, payment, messaging, or subscription flow. It does not send screen text or ride details to HI Acceptor servers.</Text></View>
    <View style={card}><Text style={title}>Why Accessibility is requested</Text><Text style={body}>Android Accessibility lets HI Acceptor read visible text and interact with controls. While the service and operation switch are both on, the service listens only to the driver app you selected (Jeeny Driver or Bolt Driver). It may tap only an explicitly labeled accept control after every required ride detail matches your rules. Unclear details or unsupported screens are skipped.</Text><Text style={body}>Accessibility access is powerful. You can disable it any time in Android Settings. Never disable Play Protect or other device security protections for HI Acceptor.</Text>{hasNativeAcceptor && <Pressable onPress={() => void openAccessibilitySettings()} style={{ backgroundColor: teal, padding: 13, borderRadius: 12, alignItems: "center", marginTop: 15 }}><Text style={{ color: "white", fontWeight: "800" }}>OPEN ACCESSIBILITY SETTINGS</Text></Pressable>}</View>
    <View style={card}><Text style={title}>Native integration status</Text><Text style={body}>{hasNativeAcceptor ? "Native Android module available. Enable the service in system settings, then start automation on the Home tab." : "This preview cannot read other apps or perform real Android actions. The native service is available only in an installed Android build."}</Text></View>
    <View style={card}><Text style={title}>Local activity</Text><Text style={body}>{count} recent record{count === 1 ? "" : "s"} saved on this device.</Text><Pressable onPress={() => void clear()} style={{ paddingVertical: 12 }}><Text style={{ color: "#A33F38", fontWeight: "700" }}>Clear local activity</Text></Pressable></View>
    <Text style={{ color: muted, fontSize: 11, lineHeight: 17 }}>The app is provided free by the community. It is independent of Jeeny and Bolt. Follow those services’ terms and local laws. Drivers remain responsible for reviewing request details and their choices.</Text>
  </ScrollView></ScreenContainer>;
}
const card = { backgroundColor: "white", borderRadius: 19, padding: 17, borderWidth: 1, borderColor: "#E2EAE8", marginBottom: 13 } as const;
const title = { color: ink, fontSize: 16, fontWeight: "800" as const };
const body = { color: muted, fontSize: 13, lineHeight: 20, marginTop: 10 };
