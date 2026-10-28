// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MonthlyReviewPage, type Item } from "../src/pages/MonthlyReview";
import { portfolioStatistics } from "../src/pages/MonthlyReviewExperience";
import { api } from "../src/api";
vi.mock("../src/auth", () => ({ useAuth: () => ({ user: { id: 1, role: "admin" } }) }));
vi.mock("../src/api", async original => ({ ...await original<typeof import("../src/api")>(), api: vi.fn() }));
const projects: Item[] = [
  { id: 1, project_no: "PRJ-1", name: "Inspection", progress: 40, status: "in_progress", reporting_category: "AI", department_name: "Quality", owner_name: "Jane", group_id: 10, created_at: "2026-10-01" },
  { id: 2, project_no: "PRJ-2", name: "Safety system", progress: 0, status: "planned", reporting_category: "AI", department_name: "Quality", group_id: 10, created_at: "2026-10-01" },
  { id: 3, project_no: "PRJ-3", name: "Portal", progress: 100, status: "completed", reporting_category: "Software", department_name: "DTU", owner_name: "Jane", created_at: "2026-10-01" }
];
const request = { id: 42, request_no: "REQ-42", title: "Inspection request", current_problem: "Manual inspection takes too long.", desired_outcome: "Automate quality checks.", reporting_category: "AI", department_name: "Quality", requester_name: "Aisha", status: "approved", created_project_id: 1, project_progress: 40, project_status: "in_progress", created_at: "2026-10-01", progress: null };
let root: Root, host: HTMLDivElement;
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  vi.mocked(api).mockReset().mockImplementation(async url => url === "/api/staff/requests/42" ? { item: request, project: projects[0], attachments: [{ id: 7, original_name: "Requirements.pdf", mime_type: "application/pdf" }] } : { month: "2026-10", portfolio: projects, projects: [], currentProjects: [], plans: [], requests: [], requestPortfolio: [request], groups: [{ id: 10, name: "Quality", summary: "Quality tools", project_ids: [1, 2] }] });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render(view = "requests") {
  await act(async () => root.render(<MemoryRouter initialEntries={[`/monthly-review?view=${view}&month=2026-10`]}><MonthlyReviewPage /><Location /></MemoryRouter>));
}
async function click(text: string, scope: ParentNode = host) {
  const button = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === text || button.getAttribute("aria-label") === text)!;
  expect(button).toBeTruthy(); await act(async () => { button.focus(); button.click(); });
}
it("opens request details from the table without leaving Monthly Review", async () => {
  await render(); await click("Inspection request");
  const dialog = document.querySelector('[data-review-dialog]')!;
  expect(dialog.textContent).toContain(request.current_problem);
  expect(dialog.textContent).toContain(request.desired_outcome);
  expect(dialog.querySelector('a[href="/api/staff/attachments/7"]')).not.toBeNull();
  expect(host.querySelector('[data-testid="location"]')?.textContent).toContain("/monthly-review?");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(document.querySelector('[data-review-dialog]')).toBeNull();
  expect(document.activeElement?.textContent).toBe("Inspection request");
});
it("keeps presentation open when request and linked project popups close", async () => {
  await render(); await click("Present review ↗");
  await click("Inspection request", host.querySelector('.mr-presentation')!);
  expect(host.querySelector('.mr-presentation')?.hasAttribute('inert')).toBe(true);
  await click("View project", document.querySelector('[data-review-dialog]')!);
  expect(document.querySelector('[data-review-dialog] h2')?.textContent).toBe("Inspection");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(document.querySelector('[data-review-dialog]')).toBeNull();
  expect(host.querySelector('.mr-presentation')).not.toBeNull();
});
it("opens the same request popup from cards", async () => {
  await render(); await click("Cards"); await click("Inspection request");
  expect(document.querySelector('[data-review-dialog]')?.textContent).toContain(request.current_problem);
});
it("counts individual projects by category and status without duplicating groups", () => {
  const stats = portfolioStatistics(projects);
  expect(stats.categories.find(item => item.category === "AI")?.count).toBe(2);
  expect(stats.categories.find(item => item.category === "Software")?.count).toBe(1);
  expect(stats.statuses.find(item => item.status === "planned")?.count).toBe(1);
  expect(stats).toMatchObject({ groups: 1, departments: 2, unassigned: 1 });
  expect(portfolioStatistics([]).categories.every(item => item.count === 0)).toBe(true);
});
it("shows category statistics and filters the overview table when a category is selected", async () => {
  await render("portfolio");
  expect(host.querySelector('[aria-label="Portfolio statistics"]')?.textContent).toContain("1 group");
  await click("AI: 2 projects");
  expect(host.querySelector('[data-testid="location"]')?.textContent).toContain("category=AI");
  expect(host.querySelector('tbody')?.textContent).not.toContain("Portal");
});
