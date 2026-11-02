import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const mocks = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("mqtt", () => ({ connect: mocks.connect }));
import { IotMonitor, parseMonitorConfig, parseTelemetry } from "../server/iotMonitor.js";

const files: string[] = [];
const monitors: IotMonitor[] = [];
afterEach(() => {
  monitors.forEach(monitor => monitor.stop()); monitors.length = 0;
  files.forEach(file => fs.rmSync(file, { force: true })); files.length = 0;
  vi.useRealTimers(); vi.clearAllMocks();
});

function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T07:00:00Z"));
  const client = Object.assign(new EventEmitter(), {
    subscribe: vi.fn((_topic, _options, callback) => callback(null, [{ qos: 0 }])), end: vi.fn()
  });
  mocks.connect.mockReturnValue(client);
  const file = path.join(os.tmpdir(), `dtu-iot-${crypto.randomUUID()}.json`);
  fs.writeFileSync(file, JSON.stringify({ systems: [{ id: "sdy-checksheet-l1", enabled: true,
    brokerUrl: "mqtt://100.81.245.93:1883", topic: "sdy1/data", delayedAfterSeconds: 30, silentAfterSeconds: 120 }] }));
  files.push(file);
  const monitor = new IotMonitor(); monitors.push(monitor); monitor.start(file);
  const system = () => monitor.snapshot().systems.find(item => item.id === "sdy-checksheet-l1")!;
  const message = (payload: string, retain = false) => client.emit("message", "sdy1/data", Buffer.from(payload), { retain });
  return { monitor, client, system, message, file };
}

describe("direct MQTT monitoring", () => {
  it("tracks live activity separately from planned stops and recovers after silence/disconnection", () => {
    const { client, system, message } = setup();
    expect(system().status).toBe("unreachable");
    client.emit("connect"); expect(system().status).toBe("waiting");
    message('{"current_mode":"PLANNED STOP","total_product_count":30}');
    expect(system()).toMatchObject({ status: "healthy", telemetry: { current_mode: "PLANNED STOP", total_product_count: 30 } });
    vi.advanceTimersByTime(30000); expect(system().status).toBe("delayed");
    vi.advanceTimersByTime(90000); expect(system().status).toBe("silent");
    expect(system().telemetry?.total_product_count).toBe(30);
    client.emit("close"); expect(system().status).toBe("unreachable");
    client.emit("connect"); message('{"total_product_count":31}');
    expect(system().status).toBe("healthy"); expect(system().telemetry?.total_product_count).toBe(31);
  });

  it("does not treat retained snapshots or unrelated topics as a live heartbeat", () => {
    const { client, system, message } = setup(); client.emit("connect");
    message('{"line":"SDY1"}', true);
    client.emit("message", "other/topic", Buffer.from('{"line":"SDY1"}'), { retain: false });
    expect(system().lastMessageAt).toBeNull();
    vi.advanceTimersByTime(120000); expect(system().status).toBe("silent");
  });

  it("preserves the last valid telemetry with its own timestamp when malformed data arrives", () => {
    const { client, system, message } = setup(); client.emit("connect");
    message('{"product_count":0,"overtime":false,"shift_entry_window_ends_at":null,"secret":"hidden"}');
    const original = system().telemetryAt;
    vi.advanceTimersByTime(10000); message("invalid JSON");
    expect(system()).toMatchObject({ status: "healthy", dataWarning: true, telemetryAt: original,
      telemetry: { product_count: 0, overtime: false, shift_entry_window_ends_at: null } });
    expect(system().telemetry).not.toHaveProperty("secret");
    expect(system().lastMessageAt).not.toBe(original);
  });

  it("keeps failed subscriptions unknown and cleans up clients on shutdown", () => {
    const { client, monitor, system } = setup();
    client.subscribe.mockImplementation((_topic, _options, callback) => callback(null, [{ qos: 128 }]));
    client.emit("connect");
    expect(system()).toMatchObject({ status: "unreachable", connectionIssue: true });
    monitor.stop(); expect(client.end).toHaveBeenCalledWith(true);
    expect(monitor.snapshot().receiverRunning).toBe(false);
    expect(JSON.stringify(monitor.snapshot())).not.toContain("100.81.245.93");
  });

  it("handles missing/invalid configuration and leaves the eight systems visible", () => {
    const { monitor, file } = setup(); monitor.stop();
    fs.writeFileSync(file, "broken");
    const other = new IotMonitor(); monitors.push(other);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    other.start(file);
    expect(other.snapshot()).toMatchObject({ receiverRunning: true, configurationError: true });
    expect(other.snapshot().systems).toHaveLength(8);
    log.mockRestore();
  });

  it("rejects duplicate IDs, wildcard topics, embedded secrets and invalid thresholds", () => {
    const entry = { id: "sdy-checksheet-l1", enabled: true, brokerUrl: "mqtt://100.81.245.93:1883", topic: "sdy1/data" };
    expect(() => parseMonitorConfig({ systems: [entry, entry] })).toThrow();
    expect(() => parseMonitorConfig({ systems: [{ ...entry, topic: "#" }] })).toThrow();
    expect(() => parseMonitorConfig({ systems: [{ ...entry, brokerUrl: "mqtt://user:secret@host" }] })).toThrow();
    expect(() => parseMonitorConfig({ systems: [{ ...entry, delayedAfterSeconds: 60, silentAfterSeconds: 30 }] })).toThrow();
    expect(() => parseTelemetry(Buffer.alloc(65537))).toThrow();
    expect(() => parseTelemetry(Buffer.from("[]"))).toThrow();
  });
});
