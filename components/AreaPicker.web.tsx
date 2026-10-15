import { Text, TextInput, View } from "react-native";
import type { AreaCircle } from "@/lib/ride-rules";

type Props = { area?: AreaCircle | null; region: "SA" | "JO"; onChange: (point: Pick<AreaCircle, "latitude" | "longitude" | "radiusMeters">) => void };
export function AreaPicker({ area, region, onChange }: Props) {
  const fallback = region === "SA" ? { latitude: 24.7136, longitude: 46.6753 } : { latitude: 31.9539, longitude: 35.9106 };
  const value = area ?? { ...fallback, radiusMeters: 1000 };
  const set = (key: "latitude" | "longitude" | "radiusMeters", text: string) => onChange({ ...value, [key]: Number(text) || 0 });
  return <View style={{ backgroundColor: "#F3F6F5", borderRadius: 14, padding: 13 }}>
    <Text style={{ color: "#102532", fontWeight: "700" }}>Map pin picker is available in the Android app. Preview fallback: enter the center coordinates and circle radius.</Text>
    <Field label="CENTER LATITUDE" value={String(value.latitude)} onChange={(v) => set("latitude", v)} />
    <Field label="CENTER LONGITUDE" value={String(value.longitude)} onChange={(v) => set("longitude", v)} />
    <Field label="RADIUS (METERS) · 250–10,000" value={String(value.radiusMeters)} onChange={(v) => set("radiusMeters", v)} />
    <Text style={{ color: "#5E707A", fontSize: 11, marginTop: 8 }}>Map tiles © OpenStreetMap contributors when using the Android map picker.</Text>
  </View>;
}
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <View style={{ marginTop: 10 }}><Text style={{ color: "#5E707A", fontSize: 10, fontWeight: "800" }}>{label}</Text><TextInput keyboardType="decimal-pad" value={value} onChangeText={onChange} style={{ borderWidth: 1, borderColor: "#DDE6E4", borderRadius: 10, padding: 10, marginTop: 5, backgroundColor: "white" }} /></View>;
}
