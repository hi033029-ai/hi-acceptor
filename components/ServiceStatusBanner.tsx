import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ServiceState } from "@/lib/native/hiAcceptor";

type Props = {
  status: ServiceState;
  onReconnect: () => void;
  onOpenSettings: () => void;
};

export function ServiceStatusBanner({ status, onReconnect, onOpenSettings }: Props) {
  const healthy = status === "CONNECTED" || status === "RUNNING";
  const title = {
    RUNNING: "Automation is running",
    CONNECTED: "Accessibility service is connected",
    ENABLED_BUT_NOT_CONNECTED: "Accessibility is enabled but not connected",
    DISABLED: "Accessibility service is disabled",
    ERROR: "Accessibility service status unavailable",
  }[status];

  return (
    <View style={[styles.container, healthy ? styles.healthy : styles.warning]}>
      <Text style={styles.title}>{title}</Text>
      {!healthy && (
        <View style={styles.actions}>
          <Pressable style={styles.button} onPress={onReconnect}>
            <Text style={styles.buttonText}>Reconnect</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={onOpenSettings}>
            <Text style={styles.buttonText}>Open Settings</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  healthy: { borderColor: "#16a34a", backgroundColor: "#f0fdf4" },
  warning: { borderColor: "#dc2626", backgroundColor: "#fef2f2" },
  title: { fontSize: 14, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 8 },
  button: { borderRadius: 8, borderWidth: 1, borderColor: "#111827", paddingHorizontal: 12, paddingVertical: 8 },
  buttonText: { fontSize: 13, fontWeight: "600" },
});
