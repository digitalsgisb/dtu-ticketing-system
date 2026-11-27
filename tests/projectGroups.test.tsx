// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { groupProjectItems, flattenProjectGroups } from "../src/projectGroups";
import { GroupedProjectCollection, ProjectGroupSummary } from "../src/components/ProjectGroups";
import { resetGroupEditing, saveGroup, ungroupGroup } from "../src/groupEditing";
import { DashboardProjectSearch, searchDashboardProjects } from "../src/components/DashboardProjectSearch";
import { ReviewPresentation } from "../src/pages/MonthlyReviewExperience";
import type { Item } from "../src/pages/MonthlyReview";
import { ProjectsPage } from "../src/pages/Projects";
import { api } from "../src/api";
vi.mock("../src/auth", () => ({ useAuth: () => ({ user: { id: 7, role: "member", name: "Member" } }) }));
vi.mock("../src/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../src/api", async original => ({ ...await original<typeof import("../src/api")>(), api: vi.fn() }));
const projects = [
  { id: 1, name: "Hayari Hattoo", project_no: "P-01", group_id: 10, group_name: "Safety Digital", group_total: 2, progress: 40, status: "in_progress", department_name: "Safety", owner_id: 7, owner_name: "Member" },
  { id: 2, name: "Red Tag", project_no: "P-02", group_id: 10, group_name: "Safety Digital", group_total: 2, progress: 80, status: "on_hold", department_name: "Engineering", owner_id: 8 },
  { id: 3, name: "Energy", project_no: "P-03", progress: 100, status: "completed", department_name: "DTU", owner_id: 7 }
];
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear(); localStorage.clear(); vi.mocked(api).mockReset().mockImplementation(async url => url.endsWith("/users") ? [] : projects);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => { root.unmount(); resetGroupEditing(); }); host.remove(); vi.unstubAllGlobals(); });
it("groups only visible members and preserves unknown progress", () => {
  expect(groupProjectItems(projects)[0]).toMatchObject({ progress: 60, status: "mixed", group: { total: 2 } });
  expect(groupProjectItems([projects[0]])[0]).toMatchObject({ progress: 40, status: "in_progress" });
  expect(groupProjectItems([{ ...projects[0], progress: null }])[0].progress).toBeNull();
  expect(flattenProjectGroups([projects[2], projects[0], projects[1]]).map(p => p.id)).toEqual([1, 2, 3]);
});
it("shows a group's first system link as its main Open action and the rest as chips", async () => {
  const links = [{ id: 1, title: "CMMS", url: "https://cmms.sugidigital.org/" }, { id: 2, title: "Admin", url: "https://cmms.sugidigital.org/admin" }];
  const [entry] = groupProjectItems(projects.slice(0, 2).map(project => ({ ...project, group_links: links })));
  await act(async () => root.render(<MemoryRouter><ProjectGroupSummary entry={entry} /></MemoryRouter>));
  const primary = host.querySelector<HTMLAnchorElement>(".pg-system-primary")!;
  expect(primary.textContent).toContain("Open CMMS");
  expect(primary.textContent).toContain("cmms.sugidigital.org");
  expect(primary.getAttribute("href")).toBe("https://cmms.sugidigital.org/");
  expect(primary.target).toBe("_blank");
  expect([...host.querySelectorAll(".pg-system-chip")].map(chip => chip.textContent)).toEqual(["Admin"]);
  await act(async () => root.render(<MemoryRouter><ProjectGroupSummary entry={groupProjectItems(projects.slice(0, 2))[0]} /></MemoryRouter>));
  expect(host.querySelector(".pg-systems")).toBeNull();
});
it("shows a group edit immediately, keeps it while confirming, and rolls it back when the server refuses", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(api).mockImplementation(url => url.includes("/groups/") ? new Promise((_, fail) => { reject = fail; }) : Promise.resolve(projects));
  const view = () => <MemoryRouter><GroupedProjectCollection projects={projects} gridClassName="grid" renderProject={project => <p>{project.name}</p>} /></MemoryRouter>;
  await act(async () => root.render(view()));
  expect(host.querySelector(".pg-card h3")?.textContent).toBe("Safety Digital");
  let pending!: Promise<boolean>;
  await act(async () => { pending = saveGroup({ id: 10, name: "Safety Platform", summary: "", project_ids: [1, 2, 3], links: [{ title: "Safety", url: "https://safety.example.com/" }] }); });
  expect(host.querySelector(".pg-card h3")?.textContent).toBe("Safety Platform");
  expect(host.querySelector(".pg-card")?.classList.contains("is-saving")).toBe(true);
  expect(host.querySelector(".pg-card")?.textContent).toContain("Energy");
  expect(host.querySelector(".pg-system-primary")?.textContent).toContain("Open Safety");
  expect(host.querySelector(".pg-individuals")).toBeNull();
  await act(async () => { reject(new Error("Server unavailable")); await pending; });
  expect(host.querySelector(".pg-card h3")?.textContent).toBe("Safety Digital");
  expect(host.querySelector(".pg-card")?.classList.contains("is-saving")).toBe(false);
  expect(host.querySelector(".pg-individuals")?.textContent).toContain("Energy");
});
it("removes an ungrouped group from view immediately and keeps it gone once confirmed", async () => {
  let resolve!: () => void;
  vi.mocked(api).mockImplementation(url => url.includes("/groups/") ? new Promise(done => { resolve = () => done({ ok: true }); }) : Promise.resolve(projects));
  await act(async () => root.render(<MemoryRouter><GroupedProjectCollection projects={projects} gridClassName="grid" renderProject={project => <p>{project.name}</p>} /></MemoryRouter>));
  let pending!: Promise<boolean>;
  await act(async () => { pending = ungroupGroup({ id: 10, name: "Safety Digital" }); });
  expect(host.querySelector(".pg-card")).toBeNull();
  await act(async () => { resolve(); await pending; });
  expect(vi.mocked(api).mock.calls.some(([url, options]) => url === "/api/staff/monthly-review/groups/10" && options?.method === "DELETE")).toBe(true);
});
it("searches project identifiers, departments, owners, and parent names without case sensitivity", () => {
  expect(searchDashboardProjects(projects, " safety DIGITAL ").map(p => p.id)).toEqual([1, 2]);
  expect(searchDashboardProjects(projects, "p-02 engineer").map(p => p.id)).toEqual([2]);
  expect(searchDashboardProjects(projects, "member").map(p => p.id)).toEqual([1]);
  expect(searchDashboardProjects(projects, "")).toEqual([]);
});
it("shows immediate dashboard results and opens a project directly", async () => {
  await act(async () => root.render(<MemoryRouter><Routes><Route path="/" element={<DashboardProjectSearch />} /><Route path="/projects/:id" element={<p>Project details opened</p>} /></Routes></MemoryRouter>));
  const input = host.querySelector("input")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Safety Digital"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(host.querySelectorAll(".dps-results li")).toHaveLength(2);
  await act(async () => (host.querySelector('.dps-results a') as HTMLAnchorElement).click());
  expect(host.textContent).toContain("Project details opened");
});
it("keeps My Projects scoped before grouping and shows a collapsed group as a card that expands and remembers it", async () => {
  await act(async () => root.render(<MemoryRouter><ProjectsPage myProjectsOnly /></MemoryRouter>));
  const card = host.querySelector(".pg-card")!;
  expect(card.querySelector("h3")?.textContent).toBe("Safety Digital");
  expect(card.textContent).toContain("40%");
  expect(card.textContent).toContain("Hayari Hattoo");
  expect(host.querySelectorAll(".project-card")).toHaveLength(1);
  expect(host.textContent).not.toContain("Red Tag");
  await act(async () => (host.querySelector('[aria-label="Expand Safety Digital"]') as HTMLButtonElement).click());
  expect(host.querySelector(".pg-card")).toBeNull();
  expect(host.querySelector(".pg-group")?.textContent).toContain("1 of 2 projects shown");
  expect(host.querySelectorAll(".project-card")).toHaveLength(2);
  expect(JSON.parse(localStorage.getItem("dtu-expanded-project-groups")!)).toEqual([10]);
  await act(async () => (host.querySelector('[aria-label="Collapse Safety Digital"]') as HTMLButtonElement).click());
  expect(host.querySelector(".pg-card")).not.toBeNull();
  expect(host.querySelectorAll(".project-card")).toHaveLength(1);
});

it("shows Quick update for members on projects owned by other people", async () => {
  localStorage.setItem("dtu-expanded-project-groups", "[10]");
  await act(async () => root.render(<MemoryRouter><ProjectsPage /></MemoryRouter>));
  expect(host.querySelectorAll(".project-card-quick-update")).toHaveLength(3);
  expect(host.querySelector('a.project-card-quick-update[href="/projects/2?update=1"]')).not.toBeNull();
});
it("opens group and search links as filtered project lists", async () => {
  await act(async () => root.render(<MemoryRouter initialEntries={["/projects?group=10&search=red"]}><ProjectsPage /></MemoryRouter>));
  expect(host.querySelectorAll(".project-card")).toHaveLength(1);
  expect(host.querySelector(".project-card")?.textContent).toContain("Red Tag");
  expect(host.querySelector('.pg-group-heading')?.textContent).toContain("80%");
});

it("presents related projects together and recalculates the group when a category is selected", async () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  const items = projects.map((project, index) => ({ ...project, reporting_category: index === 0 ? "Software" : "IoT", created_at: "2026-10-01" })) as Item[];
  await act(async () => root.render(<ReviewPresentation sections={{ current: items }} initialTab="current" label="October" initialCategory="all" onClose={() => {}} renderItem={item => <p>{item.name}</p>} renderTable={() => null} />));
  await act(async () => ([...host.querySelectorAll("button")].find(button => button.textContent === "Start projects →")!).click());
  expect(host.querySelector('.pg-group-slide')?.textContent).toContain("Hayari Hattoo");
  expect(host.querySelector('.pg-group-slide')?.textContent).toContain("Red Tag");
  expect(host.querySelector('.pg-group-heading')?.textContent).toContain("60%");
  await act(async () => ([...host.querySelectorAll('.mr-presentation-rail button')].find(button => button.textContent === "Software")! as HTMLButtonElement).click());
  expect(host.querySelector('.pg-group-heading')?.textContent).toContain("40%");
  expect(host.querySelector('.pg-group-slide')?.textContent).not.toContain("Red Tag");
});
