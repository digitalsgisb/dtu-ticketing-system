// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MonthlyReviewPage, type Item } from "../src/pages/MonthlyReview";
import { portfolioRows, type ProjectGroup } from "../src/pages/MonthlyReviewPortfolio";
import { api } from "../src/api";

vi.mock("../src/api", async original => ({ ...await original<typeof import("../src/api")>(), api: vi.fn() }));
const children: Item[] = [
  { id: 1, name: "Hayari Hattoo", project_no: "PRJ-1", description: "Report safety observations", current_update: "Pilot running", next_action: "Review feedback", progress: 40, status: "in_progress", department_name: "Safety", reporting_category: "Software", group_id: 10, created_at: "2026-10-01", links: [] },
  { id: 2, name: "Red Tag", project_no: "PRJ-2", description: "Track unsafe equipment", progress: 80, status: "on_hold", department_name: "Engineering", reporting_category: "IoT", photos: [{ id: 12, created_at: "2026-10-20", body: "Safety pilot evidence" }], group_id: 10, created_at: "2026-10-01", links: [{ id: 1, title: "Red Tag system", url: "https://example.com/red-tag" }, { id: 2, title: "Unsafe legacy link", url: "javascript:alert(1)" }] },
  { id: 3, name: "Energy dashboard", project_no: "PRJ-3", progress: 100, status: "completed", department_name: "DTU", reporting_category: "IoT", group_id: null, created_at: "2026-10-01", links: [] }
];
const groups: ProjectGroup[] = [{ id: 10, name: "Safety Digital", summary: "Digital tools for safer work", project_ids: [1, 2] }];
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  vi.mocked(api).mockReset().mockResolvedValue({ month: "2026-10", portfolio: structuredClone(children), groups: structuredClone(groups), projects: [], currentProjects: children.slice(0, 2), plans: [], requests: [] });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function settle() { await act(async () => vi.advanceTimersByTime(170)); }
async function render() { await act(async () => root.render(<MemoryRouter initialEntries={["/monthly-review?view=portfolio&month=2026-10"]}><MonthlyReviewPage /></MemoryRouter>)); await settle(); }
async function click(label: string, scope: ParentNode = document) {
  const button = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === label || item.getAttribute("aria-label") === label);
  expect(button).toBeTruthy(); await act(async () => { button!.focus(); button!.click(); }); await settle();
}

it("aggregates only visible group members, preserves child values, and marks mixed statuses", () => {
  const rows = portfolioRows(children, groups, true);
  expect(rows).toHaveLength(2);
  expect(rows.find(row => row.name === "Safety Digital")).toMatchObject({ name: "Safety Digital", progress: 60, status: "mixed", department: "Engineering · Safety" });
  expect(rows.map(row => row.name)).toEqual(["Energy dashboard", "Safety Digital"]);
  expect(children.map(child => child.progress)).toEqual([40, 80, 100]);
  expect(portfolioRows([children[0]], groups, true)[0]).toMatchObject({ progress: 40, status: "in_progress" });
  expect(portfolioRows([{ ...children[0], progress: null }], groups, true)[0].progress).toBeNull();
});

it("shows all requested columns and expands a combined group into its child projects", async () => {
  await render();
  expect([...host.querySelectorAll("thead th")].map(cell => cell.textContent)).toEqual(["No.", "Project name", "Category", "Department", "Summary", "Progress", "Status"]);
  expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
  expect(host.querySelector("tbody")?.textContent).toContain("60%");
  await click("Expand Safety Digital");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(4);
  expect(host.querySelector("tbody")?.textContent).toContain("2.1");
  await click("Collapse Safety Digital");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
});

it("opens group and child details with project links, and returns focus when closed", async () => {
  await render(); await click("Safety Digital");
  let dialog = document.querySelector<HTMLElement>('[data-review-dialog]')!;
  expect(dialog.textContent).toContain("Combined progress");
  expect(dialog.textContent).toContain("60%");
  const child = [...dialog.querySelectorAll<HTMLButtonElement>(".mr-group-children button")].find(button => button.textContent?.includes("Red Tag"))!;
  await act(async () => child.click());
  dialog = document.querySelector<HTMLElement>('[data-review-dialog]')!;
  expect(dialog.querySelector("h2")?.textContent).toBe("Red Tag");
  expect(dialog.querySelector('img[src="/api/staff/projects/progress-images/12"]')).not.toBeNull();
  expect(dialog.textContent).toContain("Safety pilot evidence");
  expect(dialog.querySelector('a[href="https://example.com/red-tag"]')).not.toBeNull();
  expect(dialog.querySelector('a[href^="javascript:"]')).toBeNull();
  expect(dialog.querySelector('a[href="/projects/2"]')).not.toBeNull();
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(document.querySelector('[data-review-dialog]')).toBeNull();
  expect(document.activeElement?.textContent).toBe("Safety Digital");
});

it("edits group membership without changing any project details", async () => {
  await render(); await click("Group projects");
  const dialog = document.querySelector<HTMLElement>('[data-review-dialog]')!;
  await click("Edit group Safety Digital", dialog);
  const redTag = dialog.querySelector<HTMLInputElement>('[aria-label="Include Red Tag"]')!;
  const energy = dialog.querySelector<HTMLInputElement>('[aria-label="Include Energy dashboard"]')!;
  await act(async () => { redTag.click(); energy.click(); });
  await click("Save group", dialog);
  const call = vi.mocked(api).mock.calls.find(([url, options]) => url.endsWith('/groups/10') && options?.method === 'PATCH')!;
  expect(JSON.parse(String(call[1]?.body))).toEqual({ name: "Safety Digital", summary: "Digital tools for safer work", projectIds: [1, 3] });
  expect(document.querySelector('[data-review-dialog]')?.textContent).toContain("Project group saved.");
  expect(children[0].progress).toBe(40);
});

it("opens the same overview table in presentation mode and closes only the detail popup on Escape", async () => {
  await render(); await click("Present review ↗");
  expect(host.querySelector('.mr-presentation table')).not.toBeNull();
  await click("Energy dashboard", host.querySelector('.mr-presentation')!);
  expect(document.querySelector('[data-review-dialog] h2')?.textContent).toBe("Energy dashboard");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(document.querySelector('[data-review-dialog]')).toBeNull();
  expect(host.querySelector('.mr-presentation')).not.toBeNull();
});
