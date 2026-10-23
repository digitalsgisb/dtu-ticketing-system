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
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(api).mockReset().mockResolvedValue(report);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(<MemoryRouter initialEntries={["/monthly-review?month=2026-10"]}><MonthlyReviewPage /></MemoryRouter>)); }
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find(b => b.textContent?.includes(text));
  expect(button).toBeTruthy(); await act(async () => button!.click());
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
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain("AI inspection");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })));
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Energy sensors");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement?.textContent).toContain("Present review");
  expect(document.body.classList.contains("monthly-presenting")).toBe(false);
});

it("separates the live plan pipeline from the monthly activity", async () => {
  await render(); await click("What’s next");
  expect(host.querySelector(".mr-context")?.textContent).toContain("independent of the reporting month");
  expect(host.querySelectorAll(".mr-grid .mr-card")).toHaveLength(1);
  expect(host.querySelector(".mr-grid")?.textContent).toContain("Future portal");
  expect(host.querySelector(".mr-grid")?.textContent).not.toContain("AI inspection");
});
