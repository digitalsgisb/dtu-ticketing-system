import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { connect, type MqttClient } from "mqtt";
import { z } from "zod";
import { config } from "./config.js";

export const systemCatalog = [
  { id: "pk-checksheet-l1", name: "Smart Checksheet · Line 1", site: "Port Klang" },
  { id: "pk-checksheet-l3", name: "Smart Checksheet · Line 3", site: "Port Klang" },
  { id: "pk-checksheet-mf", name: "Smart Checksheet · MF", site: "Port Klang" },
  { id: "sdy-checksheet-l1", name: "Smart Checksheet · Line 1", site: "Sendayan" },
  { id: "sdy-checksheet-l2", name: "Smart Checksheet · Line 2", site: "Sendayan" },
  { id: "oee-pe2", name: "OEE Monitoring · PE2", site: "Production" },
  { id: "oee-4mtr", name: "OEE Monitoring · 4MTR", site: "Production" },
  { id: "oee-2mtr", name: "OEE Monitoring · 2MTR", site: "Production" }
];

const entrySchema = z.object({
  id: z.string(), enabled: z.boolean().default(false),
  brokerUrl: z.string().default(""),
  topic: z.string().min(1).max(256).refine(topic => !/[+#\u0000]/.test(topic), "Use one exact topic, without wildcards"),
  delayedAfterSeconds: z.number().int().min(5).max(86400).default(30),
  silentAfterSeconds: z.number().int().min(10).max(172800).default(120),
  usernameEnv: z.string().optional(), passwordEnv: z.string().optional()
}).superRefine((entry, ctx) => {
  if (entry.silentAfterSeconds <= entry.delayedAfterSeconds)
    ctx.addIssue({ code: "custom", message: "Silent timeout must exceed delayed timeout" });
  if (entry.enabled) {
    try {
      const url = new URL(entry.brokerUrl);
      if (!["mqtt:", "mqtts:"].includes(url.protocol) || !url.hostname || url.username || url.password)
        throw new Error();
    } catch { ctx.addIssue({ code: "custom", message: "Enabled systems need an mqtt:// or mqtts:// URL without embedded credentials" }); }
  }
});
export type MonitorEntry = z.infer<typeof entrySchema>;

export function parseMonitorConfig(value: unknown): MonitorEntry[] {
  const entries = z.object({ systems: z.array(entrySchema).max(8) }).parse(value).systems;
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!systemCatalog.some(system => system.id === entry.id) || ids.has(entry.id))
      throw new Error("Unknown or duplicate IoT system ID");
    ids.add(entry.id);
  }
  return entries;
}

// Only explicitly supported production fields may leave the receiver.
const textFields = ["shift_id", "hour_slot", "line", "date", "shift", "group", "working_time", "scheduled_end_at", "model", "lot_number", "current_mode", "shift_entry_status", "shift_entry_window_ends_at"];
const numberFields = ["machine_status", "product_count", "total_product_count", "hourly_output", "total_reject", "current_cycle_time", "standard_cycle_time", "real_operating_time", "total_real_operating_time", "run_time", "loading_time", "delay_time", "downtime", "total_rest_time", "hourly_rest_time", "planned_stop_time", "model_change_time", "total_machine_time"];
export type Telemetry = Record<string, string | number | boolean | null>;
export function parseTelemetry(payload: Buffer): Telemetry {
  if (payload.length > 64 * 1024) throw new Error("Payload too large");
  const value = JSON.parse(payload.toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object");
  const result: Telemetry = {};
  for (const key of textFields) {
    if (value[key] === null) result[key] = null;
    else if (typeof value[key] === "string") result[key] = value[key].slice(0, 256);
  }
  for (const key of numberFields) {
    if (typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0) result[key] = value[key];
  }
  for (const key of ["overtime", "recovered_from_sqlite"]) if (typeof value[key] === "boolean") result[key] = value[key];
  if (!Object.keys(result).length) throw new Error("No supported telemetry fields");
  return result;
}

export type MonitorState = {
  entry?: MonitorEntry; client?: MqttClient; connected: boolean; subscribed: boolean;
  connectedAt: number | null; lastMessageAt: number | null; telemetryAt: number | null;
  telemetry: Telemetry | null; dataWarning: boolean; connectionIssue: boolean;
};
export function systemStatus(state: MonitorState, now: number) {
  if (!state.entry?.enabled) return "unconfigured";
  if (!state.connected || !state.subscribed) return "unreachable";
  const age = now - (state.lastMessageAt ?? state.connectedAt ?? now);
  if (age >= state.entry.silentAfterSeconds * 1000) return "silent";
  if (age >= state.entry.delayedAfterSeconds * 1000) return "delayed";
  return state.lastMessageAt === null ? "waiting" : "healthy";
}

export class IotMonitor {
  private states = new Map<string, MonitorState>();
  private running = false;
  private configurationError = false;
  private startedAt: number | null = null;

  start(file = process.env.IOT_MONITOR_CONFIG || path.join(config.dataDir, "iot-monitor.json")) {
    if (this.running) return;
    this.states.clear();
    this.configurationError = false;
    this.running = true;
    this.startedAt = Date.now();
    let entries: MonitorEntry[] = [];
    try {
      if (fs.existsSync(file)) entries = parseMonitorConfig(JSON.parse(fs.readFileSync(file, "utf8")));
    } catch {
      this.configurationError = true;
      console.error("IoT monitoring configuration could not be loaded. Check IOT_MONITOR_CONFIG and the setup guide.");
    }
    for (const system of systemCatalog) {
      const entry = entries.find(item => item.id === system.id);
      const state: MonitorState = { entry, connected: false, subscribed: false, connectedAt: null,
        lastMessageAt: null, telemetryAt: null, telemetry: null, dataWarning: false, connectionIssue: false };
      this.states.set(system.id, state);
      if (!entry?.enabled) continue;
      const username = entry.usernameEnv ? process.env[entry.usernameEnv] : undefined;
      const password = entry.passwordEnv ? process.env[entry.passwordEnv] : undefined;
      if ((entry.usernameEnv && !username) || (entry.passwordEnv && !password)) {
        state.connectionIssue = true;
        continue;
      }
      try {
        const client = connect(entry.brokerUrl, {
          clientId: `dtu-${randomUUID().replaceAll("-", "").slice(0, 16)}`,
          username, password, clean: true, protocolVersion: 4, keepalive: 15,
          reconnectPeriod: 5000, connectTimeout: 10000, reconnectOnConnackError: true,
          resubscribe: false
        });
        state.client = client;
        client.on("connect", () => {
          state.connected = true;
          state.subscribed = false;
          state.connectedAt = Date.now();
          client.subscribe(entry.topic, { qos: 0 }, (error, granted) => {
            state.subscribed = !error && !!granted?.length && granted.every(grant => Number(grant.qos) < 128);
            state.connectionIssue = !state.subscribed;
          });
        });
        client.on("message", (topic, payload, packet) => {
          // Retained snapshots replayed on subscription are not proof of a live publisher.
          if (topic !== entry.topic || packet.retain) return;
          state.lastMessageAt = Date.now();
          try {
            state.telemetry = parseTelemetry(payload);
            state.telemetryAt = state.lastMessageAt;
            state.dataWarning = false;
          } catch { state.dataWarning = true; }
        });
        const disconnected = () => { state.connected = false; state.subscribed = false; };
        client.on("close", disconnected);
        client.on("offline", disconnected);
        client.on("error", () => { state.connectionIssue = true; });
      } catch { state.connectionIssue = true; }
    }
  }

  snapshot(now = Date.now()) {
    return {
      generatedAt: new Date(now).toISOString(), receiverStartedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
      receiverRunning: this.running, configurationError: this.configurationError,
      systems: systemCatalog.map(system => {
        const state = this.states.get(system.id);
        return { ...system, status: state ? systemStatus(state, now) : "unconfigured",
          brokerConnected: state?.connected ?? false, subscribed: state?.subscribed ?? false,
          connectionIssue: state?.connectionIssue ?? false,
          lastMessageAt: state?.lastMessageAt ? new Date(state.lastMessageAt).toISOString() : null,
          telemetryAt: state?.telemetryAt ? new Date(state.telemetryAt).toISOString() : null,
          telemetry: state?.telemetry ?? null, dataWarning: state?.dataWarning ?? false,
          delayedAfterSeconds: state?.entry?.delayedAfterSeconds ?? 30,
          silentAfterSeconds: state?.entry?.silentAfterSeconds ?? 120 };
      })
    };
  }

  stop() {
    for (const state of this.states.values()) { state.client?.end(true); state.connected = false; state.subscribed = false; }
    this.running = false;
  }
}

export const iotMonitor = new IotMonitor();
