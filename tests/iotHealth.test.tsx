// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IotHealthPanel } from "../src/pages/IotHealth";
import { WallboardPage } from "../src/pages/Wallboard";
import { api } from "../src/api";
vi.mock("../src/api", async original => ({ ...await original<typeof import("../src/api")>(), api: vi.fn() }));
vi.mock("../src/live", () => ({ useLiveRefresh: vi.fn() }));
vi.mock("../src/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, lang: "en", setLang: vi.fn() }) }));
let root: Root;
let host: HTMLDivElement;
const snapshot = () => ({ generatedAt: new Date().toISOString(), receiverRunning: true, configurationError: false,
  systems: Array.from({ length: 8 }, (_, index) => ({ id: `system-${index}`, name: `System ${index}`, site: "Sendayan", status: "healthy",
    lastMessageAt: new Date().toISOString(), telemetryAt: new Date().toISOString(), dataWarning: false,
    telemetry: { current_mode: "PLANNED STOP", total_product_count: 30, hourly_output: 0, total_reject: 0, overtime: false },
    delayedAfterSeconds: 30, silentAfterSeconds: 120 })) });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-02T08:00:00Z"));
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  vi.stubGlobal("Audio", class { preload = ""; pause() {} });
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.mocked(api).mockImplementation(async url => url === "/api/wallboard" ? { tickets: [], projects: [], stats: { activeProjects: 0, openIssues: 0, overdue: 0, completedMonth: 0 }, generatedAt: new Date().toISOString() } : snapshot());
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("shows all eight cards, separates planned stops from health, and exposes zero/false values in details", async () => {
  await act(async () => root.render(<IotHealthPanel />));
  expect(host.querySelectorAll(".iot-card")).toHaveLength(8);
  expect(host.querySelectorAll(".iot-status-healthy")).toHaveLength(8);
  expect(host.textContent).toContain("PLANNED STOP");
  await act(async () => (host.querySelector(".iot-card") as HTMLButtonElement).click());
  const dialog = host.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("OvertimeNo");
  expect(dialog.textContent).toContain("Hourly Output0");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});

it("marks retained readings unknown when the monitoring API becomes unavailable", async () => {
  await act(async () => root.render(<IotHealthPanel />));
  vi.mocked(api).mockRejectedValue(new Error("Offline"));
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(host.textContent).toContain("Monitoring unavailable");
  expect(host.querySelectorAll(".iot-status-unknown")).toHaveLength(8);
  expect(host.textContent).toContain("Stale");
  expect(host.textContent).toContain("PLANNED STOP");
});

it("rotates task and health pages and pauses while telemetry is being inspected", async () => {
  await act(async () => root.render(<MemoryRouter><WallboardPage /></MemoryRouter>));
  const healthPanel = host.querySelector(".iot-health");
  expect(host.querySelector(".wallboard-page-layer.is-active")?.textContent).toContain("Digital Transformation Unit Task Board");
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(host.querySelector(".wallboard-page-layer.is-active")?.textContent).toContain("IoT System Health");
  await act(async () => (host.querySelector(".iot-card") as HTMLButtonElement).click());
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => (host.querySelector('[aria-label="Close system details"]') as HTMLButtonElement).click());
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(host.querySelector(".wallboard-page-layer.is-active")?.textContent).toContain("Digital Transformation Unit Task Board");
  expect(host.querySelector(".iot-health")).toBe(healthPanel);
  expect(healthPanel?.closest(".wallboard-page-layer")?.hasAttribute("inert")).toBe(true);
});
