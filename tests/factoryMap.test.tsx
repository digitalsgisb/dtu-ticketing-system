// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FactoryMapPage } from "../src/pages/FactoryMap";
import { portKlangFloors } from "../src/pages/portKlangLayout";

vi.mock("three", async original => ({ ...await original<typeof import("three")>(), WebGLRenderer: class { constructor() { throw new Error("No GPU in unit test"); } } }));
vi.mock("../src/pages/factoryProjects", async original => ({ ...await original<typeof import("../src/pages/factoryProjects")>(), useFactoryProjects: () => ({ projects: [], error: "", refresh: vi.fn() }) }));
let root: Root, host: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("React",React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true); vi.stubGlobal("matchMedia",()=>({matches:false})); host=document.createElement("div");document.body.append(host);root=createRoot(host);act(()=>root.render(<MemoryRouter><FactoryMapPage/></MemoryRouter>)); });
afterEach(()=>{act(()=>root.unmount());host.remove();vi.unstubAllGlobals();});
function click(text:string) { const button=[...host.querySelectorAll("button")].find(item=>item.textContent?.trim()===text);expect(button).toBeDefined();act(()=>button!.click()); }
it("keeps project pins and cards hidden until requested and closes them when hidden",()=>{
  const layer=host.querySelector<HTMLElement>('[aria-label="Projects on this map"]')!;
  expect(layer.hidden).toBe(true);expect(host.querySelector('[aria-label="Find a project"]')).toBeNull();
  click("Show projects");expect(layer.hidden).toBe(false);
  click("●Smart Attendance");expect(host.querySelector('[role="dialog"]')?.textContent).toContain("PRJ-0013");
  click("Hide projects");expect(layer.hidden).toBe(true);expect(host.querySelector('[role="dialog"]')).toBeNull();
  const panel=[...host.querySelectorAll("button")].find(item=>item.textContent?.includes("Line 1 · Control panel"))!;
  act(()=>panel.click());expect(host.querySelector('[role="dialog"]')).toBeNull();
});
it("switches to Port Klang and keeps searches and selections within each floor",()=>{
  const select=host.querySelector("select")!;
  act(()=>{select.value="port-klang";select.dispatchEvent(new Event("change",{bubbles:true}));});
  expect(host.textContent).toContain("Continuous forming machine 7");
  click("AI PC · first floor ↗");expect(host.querySelector(".factory-detail h2")?.textContent).toBe("AI PC · main server / database");expect(host.textContent).toContain("Receives data from the three waterjet Raspberry Pis");
  click("First floor");expect(host.textContent).toContain("Training centre");expect(host.textContent).not.toContain("Continuous forming machine 7");
  click("Rooftop / second floor");expect(host.textContent).toContain("Solar panel access");expect(host.textContent).not.toContain("Training centre");
  for(const floor of Object.values(portKlangFloors)) {
    expect(new Set(floor.assets.map(item=>item.id)).size).toBe(floor.assets.length);
    for(const asset of floor.assets) {expect(asset.width).toBeGreaterThan(0);expect(asset.depth).toBeGreaterThan(0);expect(Math.abs(asset.x)).toBeLessThan(74);expect(Math.abs(asset.z)).toBeLessThan(19);}
  }
});
it("opens Port Klang directly from its dashboard link",()=>{
  act(()=>root.render(<MemoryRouter key="port-link" initialEntries={["/factory-map?site=port-klang"]}><FactoryMapPage/></MemoryRouter>));
  expect(host.querySelector("select")?.value).toBe("port-klang");expect(host.textContent).toContain("Waterjet data flow");
});
