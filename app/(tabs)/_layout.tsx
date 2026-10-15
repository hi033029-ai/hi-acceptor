import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  return <Tabs screenOptions={{ tabBarActiveTintColor: "#087D70", headerShown: false, tabBarButton: HapticTab, tabBarStyle: { paddingTop: 8, paddingBottom: bottomPadding, height: 56 + bottomPadding, backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: 0.5 } }}>
    <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <IconSymbol size={25} name="house.fill" color={color} /> }} />
    <Tabs.Screen name="rules" options={{ title: "Rules", tabBarIcon: ({ color }) => <IconSymbol size={25} name="slider.horizontal.3" color={color} /> }} />
    <Tabs.Screen name="privacy" options={{ title: "Privacy", tabBarIcon: ({ color }) => <IconSymbol size={25} name="hand.raised.fill" color={color} /> }} />
  </Tabs>;
}
