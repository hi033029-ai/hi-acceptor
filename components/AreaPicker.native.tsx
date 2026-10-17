import { useEffect, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import type { AreaCircle } from "@/lib/ride-rules";

type Props = {
  area?: AreaCircle | null;
  region: "SA" | "JO";
  onChange: (point: Pick<AreaCircle, "latitude" | "longitude" | "radiusMeters">) => void;
};

const DEFAULTS = {
  SA: { latitude: 24.7136, longitude: 46.6753 },
  JO: { latitude: 31.9539, longitude: 35.9106 },
} as const;

export function AreaPicker({ area, region, onChange }: Props) {
  const fallback = DEFAULTS[region];
  const [latitude, setLatitude] = useState(String(area?.latitude ?? fallback.latitude));
  const [longitude, setLongitude] = useState(String(area?.longitude ?? fallback.longitude));
  const [radiusMeters, setRadiusMeters] = useState(String(area?.radiusMeters ?? 1000));
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    setLatitude(String(area?.latitude ?? fallback.latitude));
    setLongitude(String(area?.longitude ?? fallback.longitude));
    setRadiusMeters(String(area?.radiusMeters ?? 1000));
  }, [area?.id, area?.latitude, area?.longitude, area?.radiusMeters, fallback.latitude, fallback.longitude]);

  const publish = (next?: { latitude?: string; longitude?: string; radiusMeters?: string }) => {
    const lat = Number(next?.latitude ?? latitude);
    const lon = Number(next?.longitude ?? longitude);
    const radius = Number(next?.radiusMeters ?? radiusMeters);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180 || !Number.isFinite(radius) || radius < 250) return;
    onChange({ latitude: lat, longitude: lon, radiusMeters: Math.min(10000, Math.round(radius)) });
  };

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Location unavailable", "Allow location permission for HI Acceptor and try again.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = {
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
      };
      setLatitude(next.latitude);
      setLongitude(next.longitude);
      publish(next);
    } catch {
      Alert.alert("Location unavailable", "Unable to read your current location.");
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: "#DDE6E4", backgroundColor: "#F5F9F8", padding: 14 }}>
      <Text style={{ color: "#102532", fontWeight: "800", fontSize: 14 }}>Excluded area center</Text>
      <Text style={{ color: "#56706F", fontSize: 12, lineHeight: 17, marginTop: 5 }}>
        Enter coordinates or use your current location. The saved circle is applied to Jeeny destinations.
      </Text>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#56706F", fontSize: 11, fontWeight: "700", marginBottom: 4 }}>Latitude</Text>
          <TextInput value={latitude} onChangeText={setLatitude} onEndEditing={() => publish()} keyboardType="numbers-and-punctuation" style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#C9DDDB", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, color: "#102532" }} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#56706F", fontSize: 11, fontWeight: "700", marginBottom: 4 }}>Longitude</Text>
          <TextInput value={longitude} onChangeText={setLongitude} onEndEditing={() => publish()} keyboardType="numbers-and-punctuation" style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#C9DDDB", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, color: "#102532" }} />
        </View>
      </View>
      <View style={{ marginTop: 10 }}>
        <Text style={{ color: "#56706F", fontSize: 11, fontWeight: "700", marginBottom: 4 }}>Radius in metres (250–10,000)</Text>
        <TextInput value={radiusMeters} onChangeText={setRadiusMeters} onEndEditing={() => publish()} keyboardType="number-pad" style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#C9DDDB", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, color: "#102532" }} />
      </View>
      <Pressable onPress={() => void useMyLocation()} disabled={locating} style={{ marginTop: 12, backgroundColor: locating ? "#8DBAB4" : "#087D70", borderRadius: 10, paddingVertical: 11, alignItems: "center" }}>
        <Text style={{ color: "white", fontWeight: "800" }}>{locating ? "Locating…" : "Use my location"}</Text>
      </Pressable>
      <Pressable onPress={() => publish()} style={{ marginTop: 8, borderWidth: 1, borderColor: "#087D70", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
        <Text style={{ color: "#087D70", fontWeight: "800" }}>Apply area</Text>
      </Pressable>
    </View>
  );
}
