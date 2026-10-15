import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import type { AreaCircle } from "@/lib/ride-rules";

type Props = { area?: AreaCircle | null; region: "SA" | "JO"; onChange: (point: Pick<AreaCircle, "latitude" | "longitude" | "radiusMeters">) => void };

export function AreaPicker({ area, region, onChange }: Props) {
  const [html] = useState(() => {
    const center = area ? [area.latitude, area.longitude] : region === "SA" ? [24.7136, 46.6753] : [31.9539, 35.9106];
    const radius = area?.radiusMeters ?? 1000;
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""><style>*{box-sizing:border-box}html,body,#map{height:100%;width:100%;margin:0;font-family:system-ui;background:#edf2f1}.badge{position:absolute;z-index:999;left:12px;right:12px;top:12px;padding:11px 13px;border-radius:13px;background:#fff;box-shadow:0 2px 12px #10253222;font-size:13px;color:#102532}.badge strong{color:#087d70}.leaflet-control-attribution{font-size:10px!important}</style></head><body><div id="map"></div><div class="badge">Tap map to set circle center · radius <strong id="radiusLabel">${radius} m</strong><br><label>Radius <input id="radius" type="range" min="250" max="10000" step="250" value="${radius}" style="width:70%"></label></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script><script>const map=L.map('map').setView([${center[0]},${center[1]}],${area?14:11});L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);let point=${area?`[${area.latitude},${area.longitude}]`:'null'};let radius=${radius};let marker,circle;function draw(){if(marker)map.removeLayer(marker);if(circle)map.removeLayer(circle);if(point){marker=L.circleMarker(point,{radius:8,color:'#fff',weight:3,fillColor:'#087d70',fillOpacity:1}).addTo(map);circle=L.circle(point,{radius:radius,color:'#20b7a5',fillColor:'#20b7a5',fillOpacity:.2,weight:3}).addTo(map);window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({latitude:point[0],longitude:point[1],radiusMeters:radius}))}}map.on('click',e=>{point=[e.latlng.lat,e.latlng.lng];draw()});document.getElementById('radius').addEventListener('input',e=>{radius=Number(e.target.value);document.getElementById('radiusLabel').textContent=radius+' m';draw()});if(point)draw();</script></body></html>`;
  });
  const source = useMemo(() => ({ html }), [html]);
  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const value = JSON.parse(event.nativeEvent.data);
      if (Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && Number.isFinite(value.radiusMeters)) onChange(value);
    } catch { /* Ignore malformed in-page messages. */ }
  }, [onChange]);
  return <View style={{ height: 350, overflow: "hidden", borderRadius: 16, borderWidth: 1, borderColor: "#DDE6E4" }}><WebView originWhitelist={["*"]} source={source} userAgent="HI Acceptor/1.0 (+https://github.com/hi033029-ai/hi-acceptor)" javaScriptEnabled domStorageEnabled onMessage={onMessage} /></View>;
}
