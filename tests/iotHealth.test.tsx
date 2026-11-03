// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IotHealthPanel } from "../src/pages/IotHealth";
import { WallboardPage } from "../src/pages/Wallboard";
import { api } from "../src/api";
import { useLiveRefresh } from "../src/live";
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
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.mocked(api).mockImplementation(async url => url === "/api/wallboard" ? { tickets: [], projects: [], stats: { activeProjects: 0, openIssues: 0, overdue: 0, completedMonth: 0 }, generatedAt: new Date().toISOString() } : snapshot());
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

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
  await act(async () => vi.advanceTimersByTimeAsync(299999));
  expect(host.querySelector(".wallboard-page-layer.is-active")?.textContent).toContain("Digital Transformation Unit Task Board");
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(host.querySelector(".wallboard-page-layer.is-active")?.textContent).toContain("IoT System Health");
  await act(async () => (host.querySelector(".iot-card") as HTMLButtonElement).click());
  await act(async () => vi.advanceTimersByTimeAsync(300000));
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => (host.querySelector('[aria-label="Close system details"]') as HTMLButtonElement).click());
  await act(async () => vi.advanceTimersByTimeAsync(300000));
  expect(host.querySelector(".wallboard-page-layer.is-active")?.textContent).toContain("Digital Transformation Unit Task Board");
  expect(host.querySelector(".iot-health")).toBe(healthPanel);
  expect(healthPanel?.closest(".wallboard-page-layer")?.hasAttribute("inert")).toBe(true);
});

it("keeps all eight health systems visible on a short display without cycling them away", async () => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 960, height: 380 } as DOMRect);
  await act(async () => root.render(<IotHealthPanel wallboard />));
  const visible = () => [...host.querySelectorAll<HTMLButtonElement>(".iot-card")].filter(card => !card.hidden);
  expect(visible()).toHaveLength(8);
  expect(visible()[0].textContent).toContain("System 0");
  expect(host.textContent).toContain("All 8 systems in view");
  expect(host.querySelector(".iot-grid-dense")).not.toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(15000));
  expect(visible()[0].textContent).toContain("System 0");
  await act(async () => visible()[0].click());
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(visible()[0].textContent).toContain("System 0");
  await act(async () => (host.querySelector('[aria-label="Close system details"]') as HTMLButtonElement).click());
  await act(async () => vi.advanceTimersByTimeAsync(15000));
  expect(visible()).toHaveLength(8);
  expect(visible()[0].textContent).toContain("System 0");
});

it("immediately returns to the task board when new work arrives and restarts the five-minute interval", async () => {
  await act(async () => root.render(<MemoryRouter><WallboardPage /></MemoryRouter>));
  await act(async () => vi.advanceTimersByTimeAsync(300000));
  expect(host.querySelector(".wallboard-page-layer.is-active")?.textContent).toContain("IoT System Health");
  const before = vi.mocked(api).getMockImplementation()!;
  vi.mocked(api).mockImplementation(async url => url === "/api/wallboard" ? {
    tickets: [{ id: 99, title: "New machine issue", ticket_no: "TKT-99", type: "issue", status: "open", priority: "high" }],
    projects: [], stats: { activeProjects: 0, openIssues: 1, overdue: 0, completedMonth: 0 }, generatedAt: new Date().toISOString()
  } : before(url));
  const refresh = vi.mocked(useLiveRefresh).mock.calls.at(-1)![0];
  await act(async () => { await refresh(); });
  expect(host.querySelector(".wallboard-page-layer.is-active")?.textContent).toContain("New machine issue");
  await act(async () => vi.advanceTimersByTimeAsync(299999));
  expect(host.querySelector(".wallboard-page-layer.is-active")?.textContent).toContain("Digital Transformation Unit Task Board");
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(host.querySelector(".wallboard-page-layer.is-active")?.textContent).toContain("IoT System Health");
});

it("uses four columns and two compact rows to show all systems on a TV", async () => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 992, height: 460 } as DOMRect);
  await act(async () => root.render(<IotHealthPanel wallboard />));
  expect(host.querySelectorAll(".iot-card:not([hidden])")).toHaveLength(8);
  expect(host.textContent).toContain("All 8 systems in view");
  expect((host.querySelector(".iot-grid") as HTMLElement).style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
  expect(host.querySelector(".iot-grid-compact")).not.toBeNull();
});
