// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectsPage } from "../src/pages/Projects";
import { ProgressBriefingPage } from "../src/pages/Briefing";
import { ProjectDetailPage } from "../src/pages/ProjectDetail";
import { api } from "../src/api";

vi.mock("../src/auth", () => ({ useAuth: () => ({ user: { id: 7, role: "member", name: "Team Member" } }) }));
vi.mock("../src/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../src/api", async importOriginal => ({ ...await importOriginal<typeof import("../src/api")>(), api: vi.fn() }));

let root: Root;
let host: HTMLDivElement;
const project = { id: 42, project_no: "PRJ-42", name: "Delivery project", status: "in_progress", progress: 25, priority: "medium", owner_id: 1, department_name: "DTU" };

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  vi.stubGlobal("URL", class extends URL { static revokeObjectURL = vi.fn(); });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  sessionStorage.clear();
  localStorage.clear();
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async url => {
    if (url.endsWith("/users")) return [];
    if (url === "/api/staff/projects") return [{ ...project }];
    if (url === "/api/staff/briefing") return { projects: [{ ...project }], stats: { active: 1, total: 1, onHold: 0, completed: 0, imageBytes: 0, imageCount: 0, freeBytes: 1024 } };
    return { project: { ...project }, workItems: [], updates: [], links: [], navigationProjects: [project] };
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function refresh() {
  await act(async () => { window.dispatchEvent(new Event("focus")); });
}

it.each([
  ["projects", "dtu-project-return-scroll"],
  ["briefing", "dtu-briefing-return-scroll"]
])("preserves %s scroll during live refresh and restores a saved position only once", async (page, key) => {
  sessionStorage.setItem(key, "640");
  await act(async () => root.render(<MemoryRouter>{page === "projects" ? <ProjectsPage /> : <ProgressBriefingPage />}</MemoryRouter>));
  expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 640 });
  expect(sessionStorage.getItem(key)).toBeNull();
  vi.mocked(window.scrollTo).mockClear();
  vi.mocked(api).mockClear();
  await refresh();
  await refresh();
  expect(api).toHaveBeenCalledTimes(2);
  expect(window.scrollTo).not.toHaveBeenCalled();
});

it.each(["projects", "briefing"])("does not reset %s scroll when there is no saved return position", async page => {
  await act(async () => root.render(<MemoryRouter>{page === "projects" ? <ProjectsPage /> : <ProgressBriefingPage />}</MemoryRouter>));
  await refresh();
  expect(window.scrollTo).not.toHaveBeenCalled();
});

it("keeps a member's progress draft and modal scroll intact when project data refreshes", async () => {
  await act(async () => root.render(<MemoryRouter initialEntries={["/projects/42?update=1"]}><Routes><Route path="/projects/:id" element={<ProjectDetailPage />} /></Routes></MemoryRouter>));
  const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
  expect(dialog).not.toBeNull();
  const note = dialog.querySelector("textarea") as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(note, "Testing is complete; preparing the pilot.");
    note.dispatchEvent(new Event("input", { bubbles: true }));
    (dialog.querySelector('[aria-label="Increase progress by 5 percent"]') as HTMLButtonElement).click();
  });
  dialog.scrollTop = 320;
  await refresh();
  expect(document.querySelector('[role="dialog"]')).toBe(dialog);
  expect(dialog.scrollTop).toBe(320);
  expect(note.value).toBe("Testing is complete; preparing the pilot.");
  expect(dialog.querySelector("output")?.textContent).toBe("30%");
  expect(window.scrollTo).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem("dtu-progress-draft-42")!)).toMatchObject({ progress: 30, currentUpdate: note.value });
});
