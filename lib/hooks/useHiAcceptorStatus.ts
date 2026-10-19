import { useCallback, useEffect, useState } from "react";
import { getLiveServiceState, setAutomationEnabled, type ServiceState } from "@/lib/native/hiAcceptor";

export function useHiAcceptorStatus(pollIntervalMs = 1000) {
  const [serviceState, setServiceState] = useState<ServiceState>("DISABLED");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      setServiceState(await getLiveServiceState());
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), pollIntervalMs);
    return () => clearInterval(interval);
  }, [pollIntervalMs, refresh]);

  const startAutomation = useCallback(async () => {
    await setAutomationEnabled(true);
    await refresh();
  }, [refresh]);

  const stopAutomation = useCallback(async () => {
    await setAutomationEnabled(false);
    await refresh();
  }, [refresh]);

  return {
    serviceState,
    isRefreshing,
    refresh,
    startAutomation,
    stopAutomation,
    isRunning: serviceState === "RUNNING",
    isConnected: serviceState === "CONNECTED" || serviceState === "RUNNING",
  };
}
