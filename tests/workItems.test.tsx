// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TicketsPage } from "../src/pages/Tickets";
import { api } from "../src/api";

const session = vi.hoisted(() => ({ role: "member" }));
vi.mock("../src/auth", () => ({ useAuth: () => ({ user: { id: 1, role: session.role } }) }));
vi.mock("../src/live", () => ({ useLiveRefresh: () => {} }));
vi.mock("../src/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../src/api", async importOriginal => ({ ...await importOriginal<typeof import("../src/api")>(), api: vi.fn() }));

let root: Root;
let host: HTMLDivElement;
const item = (id: number, status: string, completed = false, userId = 1) => ({ id, ticket_no: `TKT-${id}`, title: `Work ${id}`, type: "task", status, priority: "high", completion_mode: "individual", assignee_total: 2, assignee_completed: completed ? 1 : 0, assignee_name: "Me, Teammate", assignees: [{ id: userId, completed_at: completed ? "2026-10-07" : null }] });
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  session.role = "member";
  sessionStorage.clear(); localStorage.clear();
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async url => url.includes("/tickets") ? [item(1, "waiting"), item(2, "resolved", true), item(3, "in_progress", true), item(4, "assigned", false, 2)] : []);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render(path = "/tickets") {
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><TicketsPage /></MemoryRouter>));
}

it("defaults members to their assignments, with a pending list and personal completions in a table", async () => {
  await render();
  expect(host.querySelectorAll(".work-list-row")).toHaveLength(1);
  expect(host.querySelector(".work-list-row")?.textContent).toContain("Work 1");
  expect(host.querySelector('.work-list-row a[href="/tickets/1?complete=1"]')?.textContent).toBe("Complete my part");
  expect(host.querySelectorAll(".table-row")).toHaveLength(2);
  expect(host.querySelector('[aria-label="Completed work"]')?.textContent).toContain("Work 3");
  expect(host.querySelector('[aria-label="Completed work"]')?.textContent).toContain("Your part is complete · Team pending");
  expect(host.textContent).not.toContain("Work 4");
});

it("keeps shared work pending in the all-work view until the team finishes", async () => {
  await render();
  await act(async () => Array.from(host.querySelectorAll("button")).find(button => button.textContent === "All work")!.click());
  expect(host.querySelectorAll(".work-list-row")).toHaveLength(3);
  expect(host.querySelectorAll(".table-row")).toHaveLength(1);
  expect(host.querySelector('a[href="/tickets/3?complete=1"]')).toBeNull();
  expect(host.querySelector('a[href="/tickets/4?complete=1"]')).toBeNull();
});

it("lets administrators open their own queue from the dashboard link", async () => {
  session.role = "admin";
  await render("/tickets?queue=mine");
  expect(host.textContent).not.toContain("Work 4");
  expect(host.querySelectorAll(".table-row")).toHaveLength(2);
});

it("sorts pending work, switches to cards, and remembers filters between visits", async () => {
  vi.mocked(api).mockImplementation(async url => url.includes("/tickets") ? [
    { ...item(1, "assigned"), priority: "low", due_date: "2026-01-05" },
    { ...item(2, "assigned"), priority: "critical", due_date: "2026-03-01" },
    { ...item(3, "assigned"), priority: "high", due_date: "2026-02-01" }
  ] : []);
  await render();
  const titles = () => Array.from(host.querySelectorAll(".work-list-title strong")).map(node => node.textContent);
  expect(titles()).toEqual(["Work 2", "Work 3", "Work 1"]);
  const sort = host.querySelector<HTMLSelectElement>('[aria-label="Sort work"]')!;
  await act(async () => { sort.value = "due"; sort.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(titles()).toEqual(["Work 1", "Work 3", "Work 2"]);
  await act(async () => Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Cards")!.click());
  expect(host.querySelectorAll(".pending-work-card")).toHaveLength(3);
  await act(async () => root.unmount());
  root = createRoot(host);
  await render();
  expect(host.querySelector<HTMLSelectElement>('[aria-label="Sort work"]')!.value).toBe("due");
  expect(host.querySelectorAll(".pending-work-card")).toHaveLength(3);
});
