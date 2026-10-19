import AsyncStorage from "@react-native-async-storage/async-storage";

export type LogLevel = "INFO" | "WARN" | "ERROR";
type LogEntry = { timestamp: string; level: LogLevel; message: string };
const LOG_STORAGE_KEY = "@hi_acceptor/diagnostics_log";
const MAX_LOG_ENTRIES = 300;

export function redactSensitiveText(input: string): string {
  return input
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .replace(/\b(?:\+?\d[\d\s\-().]{7,}\d)\b/g, "[redacted-phone]")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[redacted-ip]")
    .slice(0, 220);
}

async function readLogs(): Promise<LogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(LOG_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as LogEntry[] : [];
  } catch { return []; }
}

export async function appendLog(level: LogLevel, message: string): Promise<void> {
  try {
    const entries = await readLogs();
    entries.push({ timestamp: new Date().toISOString(), level, message: redactSensitiveText(message) });
    await AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(entries.slice(-MAX_LOG_ENTRIES)));
  } catch {
    // Diagnostics must never interrupt ride filtering or app startup.
  }
}

export const logInfo = (message: string) => appendLog("INFO", message);
export const logWarning = (message: string) => appendLog("WARN", message);
export const logError = (message: string) => appendLog("ERROR", message);

export async function getLogText(): Promise<string> {
  return (await readLogs()).map((entry) => `[${entry.timestamp}] ${entry.level} ${entry.message}`).join("\n");
}

export async function clearLogs(): Promise<void> {
  await AsyncStorage.removeItem(LOG_STORAGE_KEY);
}
