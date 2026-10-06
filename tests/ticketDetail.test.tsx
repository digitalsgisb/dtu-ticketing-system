// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TicketDetailPage } from "../src/pages/TicketDetail";
import { api } from "../src/api";

const session = vi.hoisted(() => ({ role: "admin" }));
vi.mock("../src/auth", () => ({ useAuth: () => ({ user: { id: 1, role: session.role } }) }));
vi.mock("../src/live", () => ({ useLiveRefresh: () => {} }));
vi.mock("../src/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../src/api", async importOriginal => ({ ...await importOriginal<typeof import("../src/api")>(), api: vi.fn() }));

let root: Root;
let host: HTMLDivElement;
let itemType: "task" | "issue";
let completionMode: "individual" | "group";
let assigned: boolean;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  session.role = "admin";
  itemType = "task";
  completionMode = "individual";
  assigned = false;
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async url => url.endsWith("/users") ? [] : {
    item: { id: 42, title: "Fix retention", description: "One day", type: itemType, completion_mode: completionMode, status: "in_progress", priority: "high", source: "staff", assignees: assigned ? [{ id: 2, name: "Teammate", completed_at: null }] : [], assignee_total: assigned ? 1 : 0 },
    comments: [
      { id: 10, author_name: "Admin", author_user_id: 1, body: "See this screenshot" },
      { id: 11, author_name: "Teammate", author_user_id: 2, body: "Another update" }
    ],
    attachments: [{ id: 20, comment_id: 10, original_name: "screen.png", mime_type: "image/png", size: 1024 }], auditEvents: []
  });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render() {
  await act(async () => root.render(<MemoryRouter initialEntries={["/tickets/42"]}><Routes><Route path="/tickets/:id" element={<TicketDetailPage />} /></Routes></MemoryRouter>));
}

it("places image previews inside their message and links to full-size images", async () => {
  await render();
  const messages = host.querySelectorAll(".chat-message");
  expect(messages[0].classList.contains("is-own")).toBe(true);
  expect(messages[0].querySelector("img")?.getAttribute("src")).toBe("/api/staff/attachments/20/preview");
  expect(messages[0].querySelector("a")?.getAttribute("href")).toBe("/api/staff/attachments/20/preview");
  expect(messages[1].querySelector("img")).toBeNull();
});

it("allows admins to open editing and save group completion", async () => {
  await render();
  await act(async () => Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Edit task")!.click());
  const dialog = document.querySelector('[role="dialog"]')!;
  const method = dialog.querySelector("select")!;
  await act(async () => { method.value = "group"; method.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(dialog.textContent).toContain("Existing updates and evidence stay");
  await act(async () => dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  const patch = vi.mocked(api).mock.calls.find(([, options]) => options?.method === "PATCH");
  expect(patch?.[0]).toBe("/api/staff/tickets/42");
  expect(JSON.parse(patch?.[1]?.body as string)).toMatchObject({ title: "Fix retention", description: "One day", completionMode: "group" });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("does not offer task editing to members", async () => {
  session.role = "member";
  await render();
  expect(host.textContent).not.toContain("Edit task");
  expect(host.textContent).not.toContain("Save changes");
});

it.each(["admin", "lead"])("allows %s to edit an issue and choose group completion", async role => {
  session.role = role;
  itemType = "issue";
  await render();
  await act(async () => Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Edit issue")!.click());
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("Completion method");
  const method = dialog.querySelector("select")!;
  await act(async () => { method.value = "group"; method.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(dialog.textContent).toContain("Existing updates and evidence stay");
  const title = dialog.querySelector<HTMLInputElement>('input[minlength="3"]')!;
  const description = dialog.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Updated display issue");
    title.dispatchEvent(new Event("input", { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(description, "Corrected issue details");
    description.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  const patch = vi.mocked(api).mock.calls.find(([, options]) => options?.method === "PATCH");
  const payload = JSON.parse(patch?.[1]?.body as string);
  expect(payload).toMatchObject({ title: "Updated display issue", description: "Corrected issue details", priority: "high", assigneeIds: [], dueDate: null });
  expect(payload.completionMode).toBe("group");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("does not offer issue editing to members", async () => {
  session.role = "member";
  itemType = "issue";
  await render();
  expect(host.textContent).not.toContain("Edit issue");
});

it.each([
  ["issue", "admin"], ["issue", "lead"], ["task", "admin"], ["task", "lead"]
] as const)("lets an unassigned %s %s open group completion", async (type, role) => {
  itemType = type;
  session.role = role;
  completionMode = "group";
  assigned = true;
  await render();
  const button = Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Complete for the team");
  expect(button).toBeDefined();
  await act(async () => button!.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Complete team work");
});

it.each(["admin", "lead", "member"])("keeps individual completion assigned to each person for %s", async role => {
  session.role = role;
  itemType = "issue";
  assigned = true;
  await render();
  expect(host.querySelector(".ticket-quick-actions")?.textContent).not.toContain("Submit my work");
});

it("keeps unassigned members from completing group work", async () => {
  session.role = "member";
  itemType = "issue";
  completionMode = "group";
  assigned = true;
  await render();
  expect(host.querySelector(".ticket-quick-actions")?.textContent).not.toContain("Complete for the team");
});
