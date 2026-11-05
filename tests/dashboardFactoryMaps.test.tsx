// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { DashboardPage } from "../src/pages/Dashboard";
vi.mock("three",async original=>({...await original<typeof import("three")>(),WebGLRenderer:class{constructor(){throw new Error("No GPU in unit test");}}}));
vi.mock("../src/auth",()=>({useAuth:()=>({user:{id:1,name:"DTU",role:"admin"}})}));
vi.mock("../src/i18n",()=>({useI18n:()=>({t:(key:string)=>key})}));
vi.mock("../src/live",()=>({useLiveRefresh:()=>{}}));
vi.mock("../src/components/DashboardProjectSearch",()=>({DashboardProjectSearch:()=>null}));
vi.mock("../src/api",async original=>({...await original<typeof import("../src/api")>(),api:vi.fn().mockResolvedValue({stats:{personalOpen:0,activeProjects:36,openIssues:2,overdue:2,untriaged:9},myUpcoming:[],upcoming:[],workload:[],myWork:[],activity:[]})}));
it("places Port Klang then Sendayan below the hero and above all dashboard status cards",async()=>{
  vi.stubGlobal("React",React);vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.stubGlobal("matchMedia",()=>({matches:false}));
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  try {
    await act(async()=>root.render(<MemoryRouter><DashboardPage/></MemoryRouter>));
    await act(async()=>{await vi.dynamicImportSettled();});
    const hero=host.querySelector(".dashboard-hero")!,maps=host.querySelector(".dashboard-factory-section")!,stats=host.querySelector(".dashboard-stat-grid")!;
    expect(maps).not.toBeNull();expect(hero.compareDocumentPosition(maps)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();expect(maps.compareDocumentPosition(stats)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const cards=maps.querySelectorAll(".dashboard-factory-card");expect(cards).toHaveLength(2);
    expect(cards[0].querySelector(".factory-toolbar strong")?.textContent).toContain("Port Klang");expect(cards[1].querySelector(".factory-toolbar strong")?.textContent).toBe("Sendayan");
    expect(cards[0].querySelector("a")?.getAttribute("href")).toBe("/factory-map?site=port-klang");expect(cards[1].querySelector("a")?.getAttribute("href")).toBe("/factory-map?site=sendayan");
    expect(maps.querySelector(".factory-sidebar")).toBeNull();expect(maps.querySelector('[aria-label="Find a project"]')).toBeNull();
  } finally {act(()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
