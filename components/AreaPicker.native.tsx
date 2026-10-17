import { useCallback, useMemo, useRef } from "react";
import { Alert, View } from "react-native";
import * as Location from "expo-location";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import type { AreaCircle } from "@/lib/ride-rules";

type Props = { area?: AreaCircle | null; region: "SA" | "JO"; mapsApiKey?: string; onChange: (point: Pick<AreaCircle, "latitude" | "longitude" | "radiusMeters">) => void };

type Point = { latitude: number; longitude: number };

function openStreetMapHtml(center: Point, radius: number) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>*{box-sizing:border-box}html,body,#map{height:100%;width:100%;margin:0;font-family:system-ui;background:#edf2f1}.badge{position:absolute;z-index:2;left:12px;right:12px;top:12px;padding:10px 12px;border-radius:13px;background:#fff;box-shadow:0 2px 12px #10253222;font-size:12px;color:#102532}.badge strong{color:#087d70}.locate{border:0;border-radius:9px;background:#087d70;color:#fff;font-weight:700;padding:8px 10px;margin-top:7px}</style></head><body><div id="map"></div><div class="badge">Tap the map to set the excluded center · radius <strong id="radiusLabel">${radius} m</strong><br><input id="radius" type="range" min="250" max="10000" step="250" value="${radius}" style="width:100%"><br><button class="locate" id="locate">Use my location</button></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>let map,marker,circle;let point={lat:${center.latitude},lng:${center.longitude}};let radius=${radius};function post(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({latitude:point.lat,longitude:point.lng,radiusMeters:radius}))}function draw(){if(marker)marker.remove();if(circle)circle.remove();marker=L.marker(point).addTo(map);circle=L.circle(point,{color:'#20B7A5',weight:3,fillColor:'#20B7A5',fillOpacity:.2,radius}).addTo(map);post()}function setCurrentLocation(lat,lng){point={lat:Number(lat),lng:Number(lng)};map.setView(point,15);draw()}function showLocationError(){alert('Allow location permission for HI Acceptor, then try again.')}function requestNativeLocation(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'request-location'}))}function init(){map=L.map('map').setView(point,${center.latitude === 24.7136 || center.latitude === 31.9539 ? 11 : 14});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);map.on('click',e=>{point={lat:e.latlng.lat,lng:e.latlng.lng};draw()});document.getElementById('radius').addEventListener('input',e=>{radius=Number(e.target.value);document.getElementById('radiusLabel').textContent=radius+' m';draw()});document.getElementById('locate').addEventListener('click',requestNativeLocation);draw()}init()</script></body></html>`;
}

export function AreaPicker({ area, region, mapsApiKey, onChange }: Props) {
  const webViewRef = useRef<WebView>(null);
  const autoLocatedRef = useRef(false);
  const center = area ? { latitude: area.latitude, longitude: area.longitude } : region === "SA" ? { latitude: 24.7136, longitude: 46.6753 } : { latitude: 31.9539, longitude: 35.9106 };
  const radius = area?.radiusMeters ?? 1000;
  const html = useMemo(() => {
    if (!mapsApiKey) return openStreetMapHtml(center, radius);
    const safeKey = mapsApiKey.replace(/[^A-Za-z0-9_\-]/g, "");
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>*{box-sizing:border-box}html,body,#map{height:100%;width:100%;margin:0;font-family:system-ui;background:#edf2f1}.badge{position:absolute;z-index:2;left:12px;right:12px;top:12px;padding:10px 12px;border-radius:13px;background:#fff;box-shadow:0 2px 12px #10253222;font-size:12px;color:#102532}.badge strong{color:#087d70}.locate{border:0;border-radius:9px;background:#087d70;color:#fff;font-weight:700;padding:8px 10px;margin-top:7px}.error{padding:20px;color:#a93d3d}</style></head><body><div id="map"></div><div class="badge">Tap the map to set the excluded center · radius <strong id="radiusLabel">${radius} m</strong><br><input id="radius" type="range" min="250" max="10000" step="250" value="${radius}" style="width:100%"><br><button class="locate" id="locate">Use my location</button></div><script>let map,marker,circle;let point={lat:${center.latitude},lng:${center.longitude}};let radius=${radius};function post(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({latitude:point.lat,longitude:point.lng,radiusMeters:radius}))}function draw(){if(marker)marker.setMap(null);if(circle)circle.setMap(null);marker=new google.maps.Marker({position:point,map});circle=new google.maps.Circle({strokeColor:'#20B7A5',strokeOpacity:.9,strokeWeight:3,fillColor:'#20B7A5',fillOpacity:.2,map,center:point,radius});post()}function setCurrentLocation(lat,lng){point={lat:Number(lat),lng:Number(lng)};map.setCenter(point);map.setZoom(15);draw()}function showLocationError(){alert('Allow location permission for HI Acceptor, then try again.')}function requestNativeLocation(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'request-location'}))}function init(){map=new google.maps.Map(document.getElementById('map'),{center:point,zoom:${area ? 14 : 11},mapTypeControl:false,streetViewControl:false,fullscreenControl:false});map.addListener('click',e=>{point={lat:e.latLng.lat(),lng:e.latLng.lng()};draw()});document.getElementById('radius').addEventListener('input',e=>{radius=Number(e.target.value);document.getElementById('radiusLabel').textContent=radius+' m';draw()});document.getElementById('locate').addEventListener('click',requestNativeLocation);draw()}window.gm_authFailure=()=>{document.getElementById('map').innerHTML='<div class="error">Google Maps could not authenticate this API key.</div>'}</script><script async defer src="https://maps.googleapis.com/maps/api/js?key=${safeKey}&callback=init"></script></body></html>`;
  }, [area, center, mapsApiKey, radius]);
  const source = useMemo(() => ({ html }), [html]);
  const requestCurrentLocation = useCallback(() => {
    if (area || autoLocatedRef.current) return;
    autoLocatedRef.current = true;
    webViewRef.current?.injectJavaScript("requestNativeLocation(); true;");
  }, [area]);
  const onMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const value = JSON.parse(event.nativeEvent.data);
      if (value?.type === "request-location") {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          webViewRef.current?.injectJavaScript("showLocationError(); true;");
          return;
        }
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        webViewRef.current?.injectJavaScript(`setCurrentLocation(${position.coords.latitude},${position.coords.longitude}); true;`);
        return;
      }
      if (Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && Number.isFinite(value.radiusMeters)) onChange(value);
    } catch {
      Alert.alert("Location unavailable", "Allow location permission for HI Acceptor and try again.");
    }
  }, [onChange]);
  return <View style={{ height: 350, overflow: "hidden", borderRadius: 16, borderWidth: 1, borderColor: "#DDE6E4" }}><WebView ref={webViewRef} originWhitelist={["*"]} source={source} javaScriptEnabled domStorageEnabled onLoadEnd={requestCurrentLocation} onMessage={onMessage} /></View>;
}
