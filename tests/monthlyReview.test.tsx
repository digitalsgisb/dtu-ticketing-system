// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MonthlyReviewPage } from "../src/pages/MonthlyReview";
import { api } from "../src/api";

vi.mock("../src/api", async original => ({ ...await original<typeof import("../src/api")>(), api: vi.fn() }));
let host: HTMLDivElement;
let root: Root;
const report = { month: "2026-10", projects: [
  { id: 1, name: "AI inspection", project_no: "PRJ-01", reporting_category: "AI", department_name: "DTU", progress: 70, baseline_progress: 30, month_updates: 2, current_update: "Pilot validated", status: "in_progress" },
  { id: 2, name: "Energy sensors", project_no: "PRJ-02", reporting_category: "IoT", department_name: "DTU", progress: null, is_new: 1, month_updates: 0, status: null }
], plans: [{ id: 3, name: "Future portal", reporting_category: "Software", department_name: "DTU", progress: 0, status: "planned" }], requests: [] };
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(api).mockReset().mockResolvedValue(report);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function settle() { await act(async () => vi.advanceTimersByTime(160)); }
async function render() { await act(async () => root.render(<MemoryRouter initialEntries={["/monthly-review?month=2026-10"]}><MonthlyReviewPage /></MemoryRouter>)); await settle(); }
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find(b => b.textContent?.includes(text));
  expect(button).toBeTruthy(); await act(async () => button!.click());
  await settle();
}

it("shows recorded monthly gains and explicitly identifies missing history", async () => {
  await render();
  expect(api).toHaveBeenCalledWith("/api/staff/monthly-review?month=2026-10");
  expect(host.textContent).toContain("+40 percentage points");
  expect(host.textContent).toContain("No progress update recorded by month end.");
  expect(host.textContent).toContain("Unrecorded");
  await click("IoT");
  expect(host.querySelectorAll(".mr-grid .mr-card")).toHaveLength(1);
  expect(host.querySelector(".mr-grid")?.textContent).toContain("Energy sensors");
});

it("presents the filtered sequence with keyboard navigation and restores focus on exit", async () => {
  await render(); await click("Present review");
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain("From activity to outcomes.");
  await click("Start projects");
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain("AI inspection");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })));
  await settle();
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Energy sensors");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement?.textContent).toContain("Present review");
  expect(document.body.classList.contains("monthly-presenting")).toBe(false);
});

it("moves the category rail selection and keeps category changes inside the presentation", async () => {
  await render(); await click("Present review");
  const rail = host.querySelector('[aria-label="Presentation categories"]')!;
  const iot = [...rail.querySelectorAll("button")].find(button => button.textContent === "IoT")!;
  await act(async () => iot.click());
  expect((rail as HTMLElement).style.getPropertyValue("--rail-index")).toBe("3");
  await settle();
  expect(host.querySelector(".mr-slide")?.textContent).toContain("Energy sensors");
  expect(host.querySelector(".mr-slide")?.textContent).not.toContain("AI inspection");
  expect([...rail.querySelectorAll("button")].find(button => button.textContent === "Software")?.disabled).toBe(true);
  await click("Exit presentation");
  expect(host.querySelectorAll(".mr-grid .mr-card")).toHaveLength(2);
});

it("cancels an interrupted category fade and renders only the latest selection", async () => {
  await render();
  const buttons = [...host.querySelectorAll(".mr-categories button")];
  await act(async () => buttons.find(b => b.textContent === "AI")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await act(async () => vi.advanceTimersByTime(60));
  await act(async () => buttons.find(b => b.textContent === "IoT")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await settle();
  expect(host.querySelectorAll(".mr-grid .mr-card")).toHaveLength(1);
  expect(host.querySelector(".mr-grid")?.textContent).toContain("Energy sensors");
  expect(host.querySelector(".mr-grid")?.textContent).not.toContain("AI inspection");
  expect(host.querySelector(".mr-results")?.getAttribute("aria-busy")).toBe("false");
});

it("keeps the header visible while loading and removes print actions", async () => {
  let resolve!: (value: typeof report) => void;
  vi.mocked(api).mockImplementation(() => new Promise(done => { resolve = done; }));
  await act(async () => root.render(<MemoryRouter initialEntries={["/monthly-review?month=2026-10"]}><MonthlyReviewPage /></MemoryRouter>));
  expect(host.querySelector(".mr-hero")?.textContent).toContain("October 2026");
  expect(host.querySelector('[aria-label="Loading monthly review"]')).not.toBeNull();
  expect(host.textContent).not.toContain("Print / Save PDF");
  await act(async () => resolve(report)); await settle();
  expect(host.querySelector('[aria-label="Loading monthly review"]')).toBeNull();
  expect(host.querySelectorAll(".mr-grid .mr-card")).toHaveLength(2);
});

it("skips transition delays when reduced motion is enabled", async () => {
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
  await render();
  const iot = [...host.querySelectorAll<HTMLButtonElement>(".mr-categories button")].find(b => b.textContent === "IoT")!;
  await act(async () => iot.click());
  expect(host.querySelectorAll(".mr-grid .mr-card")).toHaveLength(1);
  expect(host.querySelector(".mr-grid")?.textContent).toContain("Energy sensors");
});

it("separates the live plan pipeline from the monthly activity", async () => {
  await render(); await click("What’s next");
  expect(host.querySelector(".mr-context")?.textContent).toContain("independent of the reporting month");
  expect(host.querySelectorAll(".mr-grid .mr-card")).toHaveLength(1);
  expect(host.querySelector(".mr-grid")?.textContent).toContain("Future portal");
  expect(host.querySelector(".mr-grid")?.textContent).not.toContain("AI inspection");
});
