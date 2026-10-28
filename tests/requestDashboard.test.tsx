// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { requestMetrics } from "../src/components/RequestDashboard";
import { RequestsPage, RequestDetailPage } from "../src/pages/Requests";
import { api } from "../src/api";
vi.mock("../src/auth", () => ({ useAuth: () => ({ user: { id: 1, role: "admin" } }) }));
vi.mock("../src/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../src/api", async original => ({ ...await original<typeof import("../src/api")>(), api: vi.fn() }));
const items = [
  { id: 1, title: "New safety request", request_no: "REQ-1", status: "submitted", reporting_category: "Other", department_name: "Safety", requester_name: "Team", current_problem: "Paper process" },
  { id: 2, title: "Approved safety request", request_no: "REQ-2", status: "approved", created_project_id: 7, project_status: "complete_monitoring", project_progress: 100 },
  { id: 3, title: "Rejected request", request_no: "REQ-3", status: "rejected" },
  { id: 4, title: "Waiting for information", request_no: "REQ-4", status: "needs_information" }
];
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(api).mockReset().mockImplementation(async url => url.endsWith('/users') ? [] : url === '/api/staff/requests' ? items : { item: { ...items[0], requester_email: "test@example.com" }, comments: [], attachments: [] });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it("calculates acceptance and delivery with explicit denominators", () => {
  expect(requestMetrics(items)).toMatchObject({ total: 4, approved: 1, delivered: 1, pending: 2, rejected: 1, acceptance: 25, delivery: 100 });
  expect(requestMetrics([])).toMatchObject({ acceptance: null, delivery: null });
  expect(requestMetrics([{ id: 1, status: 'approved' }, { id: 2, status: 'approved', created_project_id: 5, project_status: 'cancelled', project_progress: 100 }])).toMatchObject({ approved: 2, delivered: 0, delivery: 0 });
});
it("separates requests into clear stages and filters to approved work", async () => {
  await act(async () => root.render(<MemoryRouter><RequestsPage /></MemoryRouter>));
  await act(async () => ([...host.querySelectorAll(".request-view-switch button")].find(button => button.textContent === "Cards")! as HTMLButtonElement).click());
  expect(host.querySelectorAll('.request-stage-section')).toHaveLength(5);
  expect(host.querySelector('[aria-label="Pending review requests"]')?.textContent).toContain('New safety request');
  expect(host.querySelector('[aria-label="Approved requests"]')?.textContent).toContain('Approved safety request');
  const approved = [...host.querySelectorAll('.request-stage-filter button')].find(button => button.textContent?.includes('Approved')) as HTMLButtonElement;
  await act(async () => approved.click());
  expect(host.querySelectorAll('.request-stage-section')).toHaveLength(1);
  expect(host.querySelectorAll('.request-card')).toHaveLength(1);
});
it("requires a category during approval and sends the chosen category", async () => {
  await act(async () => root.render(<MemoryRouter initialEntries={['/requests/1']}><Routes><Route path='/requests/:id' element={<RequestDetailPage />} /><Route path='/projects/7' element={<p>Approved project opened</p>} /></Routes></MemoryRouter>));
  const approve = [...host.querySelectorAll('button')].find(button => button.textContent === 'approve')!;
  await act(async () => approve.click());
  expect(host.textContent).toContain('Choose a project category before approving');
  expect(vi.mocked(api).mock.calls.some(([,options]) => options?.method === 'PATCH')).toBe(false);
  const category = host.querySelector<HTMLSelectElement>('#request-project-category')!;
  expect(document.activeElement).toBe(category);
  await act(async () => { category.value = 'AI'; category.dispatchEvent(new Event('change', { bubbles: true })); });
  vi.mocked(api).mockResolvedValueOnce({ ok: true, projectId: 7 });
  await act(async () => approve.click());
  const call = vi.mocked(api).mock.calls.find(([,options]) => options?.method === 'PATCH')!;
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({ status: 'approved', reportingCategory: 'AI' });
  expect(host.textContent).toContain('Approved project opened');
});

it("shows a newest-first request table with status filters and linked project progress", async () => {
  await act(async () => root.render(<MemoryRouter><RequestsPage /></MemoryRouter>));
  expect([...host.querySelectorAll('thead th')].map(cell => cell.textContent)).toEqual(['No.', 'Request name', 'Category', 'Department', 'Summary', 'Progress', 'Status']);
  const rows = [...host.querySelectorAll('tbody tr')];
  expect(rows[0].textContent).toContain('REQ-4');
  expect(rows[2].textContent).toContain('100%');
  expect(rows[2].querySelector('a[href="/projects/7"]')).not.toBeNull();
  expect(rows[3].textContent).toContain('Awaiting approval');
  await act(async () => ([...host.querySelectorAll('.request-stage-filter button')].find(button => button.textContent?.includes('Approved'))! as HTMLButtonElement).click());
  expect(host.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(host.querySelector('tbody tr a')?.getAttribute('href')).toBe('/requests/2');
});
