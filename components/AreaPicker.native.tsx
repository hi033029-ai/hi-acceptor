import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Keyboard, Pressable, Text, TextInput, View } from "react-native";
import MapView, { Circle, Marker, PROVIDER_GOOGLE, type LatLng, type Region } from "react-native-maps";
import * as Location from "expo-location";
import type { AreaCircle } from "@/lib/ride-rules";

type Props = {
  area?: AreaCircle | null;
  region: "SA" | "JO";
  mapsApiKey?: string;
  onChange: (point: Pick<AreaCircle, "latitude" | "longitude" | "radiusMeters">) => void;
};

const CENTERS: Record<"SA" | "JO", LatLng> = {
  SA: { latitude: 24.7136, longitude: 46.6753 },
  JO: { latitude: 31.9539, longitude: 35.9106 },
};
const COUNTRY_HINT: Record<"SA" | "JO", string> = { SA: "Saudi Arabia", JO: "Jordan" };
const MIN_RADIUS = 250;
const MAX_RADIUS = 10000;
const STEP = 250;
const PRESETS = [500, 1000, 2000, 5000, 10000];
const ink = "#102532";
const teal = "#087d70";
const tealLight = "#20B7A5";
const border = "#DDE6E4";
const bg = "#edf2f1";
const clampRadius = (value: number) => Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Math.round(value / STEP) * STEP));

function regionFor(center: LatLng, radiusMeters: number): Region {
  const delta = Math.max((radiusMeters * 3.2) / 111320, 0.01);
  return { latitude: center.latitude, longitude: center.longitude, latitudeDelta: delta, longitudeDelta: delta };
}

function formatRadius(radius: number) {
  return radius >= 1000 ? `${(radius / 1000).toFixed(radius % 1000 ? 2 : 0).replace(/\.?0+$/, "")} km` : `${radius} m`;
}

export function AreaPicker({ area, region, mapsApiKey, onChange }: Props) {
  const mapRef = useRef<MapView>(null);
  const initialCenter: LatLng = area ? { latitude: area.latitude, longitude: area.longitude } : CENTERS[region];
  const initialRadius = clampRadius(area?.radiusMeters ?? 1000);
  const [point, setPoint] = useState<LatLng>(initialCenter);
  const [radius, setRadius] = useState(initialRadius);
  const radiusRef = useRef(initialRadius);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasLocation, setHasLocation] = useState(false);

  const commit = useCallback((next: LatLng, nextRadius: number, moveCamera = false) => {
    const safeRadius = clampRadius(nextRadius);
    radiusRef.current = safeRadius;
    setPoint(next);
    setRadius(safeRadius);
    onChange({ latitude: next.latitude, longitude: next.longitude, radiusMeters: safeRadius });
    if (moveCamera) mapRef.current?.animateToRegion(regionFor(next, safeRadius), 400);
  }, [onChange]);

  const locate = useCallback(async (silent = false) => {
    try {
      setBusy(true);
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted" && !silent) permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        if (!silent) Alert.alert("Location permission needed", "Allow location while using the app to center the map on you.");
        return;
      }
      setHasLocation(true);
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      commit({ latitude: position.coords.latitude, longitude: position.coords.longitude }, radiusRef.current, true);
    } catch {
      if (!silent) Alert.alert("Location unavailable", "Could not get your location. Tap the map to choose a point instead.");
    } finally {
      setBusy(false);
    }
  }, [commit]);

  useEffect(() => {
    if (!area) {
      onChange({ latitude: initialCenter.latitude, longitude: initialCenter.longitude, radiusMeters: initialRadius });
      void locate(true);
    } else {
      void Location.getForegroundPermissionsAsync().then((p) => setHasLocation(p.status === "granted")).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = useCallback(async () => {
    const text = query.trim();
    if (!text) return;
    Keyboard.dismiss();
    setBusy(true);
    try {
      const alreadyHasCountry = /saudi|jordan|السعودية|الأردن|الاردن/i.test(text);
      const results = await Location.geocodeAsync(alreadyHasCountry ? text : `${text}, ${COUNTRY_HINT[region]}`);
      const first = results[0];
      if (!first) {
        Alert.alert("Place not found", "Try another spelling, or tap the map to choose the point.");
        return;
      }
      commit({ latitude: first.latitude, longitude: first.longitude }, radiusRef.current, true);
    } catch {
      Alert.alert("Search unavailable", "Android could not look up that place. Tap the map to choose the point instead.");
    } finally {
      setBusy(false);
    }
  }, [commit, query, region]);

  const changeRadius = (next: number) => commit(point, next, true);

  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: border, overflow: "hidden", backgroundColor: "white" }}>
      <View style={{ flexDirection: "row", padding: 8, gap: 8 }}>
        <TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => void search()} placeholder="Search a neighborhood or place" placeholderTextColor="#8AA0A0" returnKeyType="search" style={{ flex: 1, backgroundColor: bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: ink, fontSize: 14 }} />
        <Pressable onPress={() => void search()} style={{ backgroundColor: teal, borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" }}><Text style={{ color: "white", fontWeight: "800" }}>Search</Text></Pressable>
      </View>
      <View style={{ height: 340 }}>
        <MapView ref={mapRef} provider={PROVIDER_GOOGLE} style={{ flex: 1 }} initialRegion={regionFor(initialCenter, initialRadius)} onPress={(event) => commit(event.nativeEvent.coordinate, radiusRef.current)} showsUserLocation={hasLocation} showsMyLocationButton={false} toolbarEnabled={false} rotateEnabled={false} pitchEnabled={false}>
          <Circle center={point} radius={radius} strokeColor={tealLight} strokeWidth={3} fillColor="rgba(32,183,165,0.22)" />
          <Marker coordinate={point} draggable onDragEnd={(event) => commit(event.nativeEvent.coordinate, radiusRef.current)} />
        </MapView>
        {busy && <View style={{ position: "absolute", top: 10, alignSelf: "center", backgroundColor: "white", borderRadius: 14, padding: 8, elevation: 3 }}><ActivityIndicator color={teal} /></View>}
        <Pressable onPress={() => void locate(false)} style={{ position: "absolute", right: 10, bottom: 10, backgroundColor: "white", borderRadius: 22, paddingVertical: 10, paddingHorizontal: 14, elevation: 3 }}><Text style={{ color: teal, fontWeight: "800" }}>My location</Text></Pressable>
      </View>
      <View style={{ padding: 12, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => changeRadius(radius - STEP)} style={stepButton}><Text style={stepText}>−</Text></Pressable>
          <View style={{ alignItems: "center" }}><Text style={{ color: ink, fontSize: 18, fontWeight: "900" }}>{formatRadius(radius)}</Text><Text style={{ color: "#6B8080", fontSize: 11 }}>excluded radius</Text></View>
          <Pressable onPress={() => changeRadius(radius + STEP)} style={stepButton}><Text style={stepText}>+</Text></Pressable>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{PRESETS.map((preset) => { const active = preset === radius; return <Pressable key={preset} onPress={() => changeRadius(preset)} style={{ backgroundColor: active ? teal : bg, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}><Text style={{ color: active ? "white" : ink, fontWeight: "700", fontSize: 12 }}>{formatRadius(preset)}</Text></Pressable>; })}</View>
        <Text style={{ color: "#6B8080", fontSize: 11 }}>Tap the map or drag the pin to set the center · {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</Text>
        {!mapsApiKey && <Text style={{ color: "#9A661C", fontSize: 11, lineHeight: 16 }}>Google Maps key is not configured in this build. Rebuild with EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.</Text>}
      </View>
    </View>
  );
}

const stepButton = { width: 44, height: 44, borderRadius: 22, backgroundColor: bg, alignItems: "center" as const, justifyContent: "center" as const };
const stepText = { color: ink, fontSize: 24, fontWeight: "800" as const, marginTop: -2 };
