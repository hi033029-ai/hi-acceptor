import { Tabs } from "expo-router";
export default function TabLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: "none" } }}>
    <Tabs.Screen name="index" options={{ title: "Home" }} />
    <Tabs.Screen name="rules" options={{ href: null }} />
    <Tabs.Screen name="privacy" options={{ href: null }} />
  </Tabs>;
}
