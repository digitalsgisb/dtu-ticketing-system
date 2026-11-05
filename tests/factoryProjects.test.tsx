// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../src/api";
import { FactoryProjectCard, factoryProjectPins, factoryProjectProgress, pinForFactoryAsset, projectForFactoryPin, useFactoryProjects, type FactoryProject } from "../src/pages/factoryProjects";
import { sendayanSystemAssets } from "../src/pages/factoryLayout";

vi.mock("../src/api", async original => ({ ...await original<typeof import("../src/api")>(), api: vi.fn() }));
vi.mock("../src/live", () => ({ useLiveRefresh: vi.fn() }));
let root: Root, host: HTMLDivElement;
const record = (changes: Partial<FactoryProject> = {}): FactoryProject => ({ id: 407, project_no: "PRJ-0013", name: "Smart Attendance (Sendayan)", status: "in_progress", progress: 70, description: "Tracking attendance", owner_name: "Project owner", department_name: "DTU", latest_image_id: 91, ...changes });
const renderCard = (projects: FactoryProject[] | null, options: { error?: string; onClose?: () => void } = {}) => act(() => root.render(<MemoryRouter><FactoryProjectCard pin={factoryProjectPins[2]} projects={projects} error={options.error ?? ""} onRetry={() => {}} onClose={options.onClose ?? (() => {})} /></MemoryRouter>));
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("resolves the saved project number even when its name or numeric database ID changes", () => {
  const desired = record({ id: 999, name: "Renamed attendance project" });
  expect(projectForFactoryPin([record({ id: 13, project_no: "PRJ-9999" }), desired], factoryProjectPins[2])).toBe(desired);
  expect(projectForFactoryPin([record({ project_no: "PRJ-9999" })], factoryProjectPins[2])).toBeUndefined();
});

it("links only the matching monitored line and Sendayan attendance asset", () => {
  for (const [assetId, projectNo] of [["line-1-panel", "PRJ-0014"], ["line-2-sensor-waterjet-1", "PRJ-0015"], ["attendance", "PRJ-0013"]]) {
    expect(pinForFactoryAsset(sendayanSystemAssets.find(asset => asset.id === assetId))?.projectNo).toBe(projectNo);
  }
  expect(pinForFactoryAsset(sendayanSystemAssets.find(asset => asset.id === "line-1-glue-1"))).toBeUndefined();
  expect(pinForFactoryAsset(sendayanSystemAssets.find(asset => asset.id === "office-data"))).toBeUndefined();
});

it("keeps completed status at 100 and distinguishes unrecorded progress", () => {
  expect(factoryProjectProgress(record({ status: "complete_monitoring", progress: 33 }))).toBe(100);
  expect(factoryProjectProgress(record({ progress: null }))).toBeNull();
  expect(factoryProjectProgress(record({ progress: 70 }))).toBe(70);
});

it("shows saved fields and routes by the actual database ID, then reflects changed data", () => {
  renderCard([record()]);
  expect(host.textContent).toContain("70%");
  expect(host.textContent).toContain("Project owner");
  expect(host.querySelector("img")?.getAttribute("src")).toBe("/api/staff/projects/progress-images/91");
  expect(host.querySelector("a")?.getAttribute("href")).toBe("/projects/407");
  renderCard([record({ progress: 47, name: "Updated project name" })]);
  expect(host.textContent).toContain("47%"); expect(host.textContent).not.toContain("70%");
  expect(host.textContent).toContain("Updated project name");
});

it("does not invent a project card when the mapped project is absent", () => {
  renderCard([record({ project_no: "PRJ-9999" })]);
  expect(host.textContent).toContain("PRJ-0013 was not found");
  expect(host.querySelector("progress")).toBeNull();
  expect(host.querySelector("a")?.getAttribute("href")).toBe("/projects");
});

it("labels cached records when refresh fails and supports Escape to close", () => {
  const onClose = vi.fn(); renderCard([record()], { error: "Offline", onClose });
  expect(host.textContent).toContain("showing the last loaded record");
  expect(host.querySelector("button[aria-label='Close project details']")).toBe(document.activeElement);
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(onClose).toHaveBeenCalledOnce();
});

it("loads records from the existing staff project API and refreshes saved data", async () => {
  let state: ReturnType<typeof useFactoryProjects>;
  function Harness() { state = useFactoryProjects(); return <div>{state.projects?.[0]?.name}</div>; }
  vi.mocked(api).mockResolvedValueOnce([record()]);
  await act(async () => root.render(<Harness />));
  expect(api).toHaveBeenLastCalledWith("/api/staff/projects", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(host.textContent).toBe("Smart Attendance (Sendayan)");
  vi.mocked(api).mockResolvedValueOnce([record({ name: "Fresh database value" })]);
  await act(async () => { await state!.refresh(); });
  expect(host.textContent).toBe("Fresh database value");
});
