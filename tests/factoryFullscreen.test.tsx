// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FactoryViewport, FactoryFullscreenButton } from "../src/pages/FactoryViewport";
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.stubGlobal("React",React);vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);host=document.createElement("div");document.body.append(host);root=createRoot(host);act(()=>root.render(<FactoryViewport label="Test plant"><div className="factory-toolbar"><FactoryFullscreenButton/></div><div className="factory-canvas"/></FactoryViewport>));});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();delete (document as any).fullscreenElement;delete (document as any).exitFullscreen;});
it("enters native fullscreen and reflects browser exit",async()=>{
  const section=host.querySelector("section")!;
  Object.defineProperty(document,"fullscreenElement",{configurable:true,writable:true,value:null});
  const request=vi.fn(async()=>{(document as any).fullscreenElement=section;document.dispatchEvent(new Event("fullscreenchange"));});
  Object.defineProperty(section,"requestFullscreen",{configurable:true,value:request});
  Object.defineProperty(document,"exitFullscreen",{configurable:true,value:vi.fn(async()=>{(document as any).fullscreenElement=null;document.dispatchEvent(new Event("fullscreenchange"));})});
  await act(async()=>host.querySelector("button")!.click());expect(request).toHaveBeenCalledOnce();expect(host.textContent).toContain("Exit fullscreen");
  await act(async()=>host.querySelector("button")!.click());expect(host.textContent).toContain("Fullscreen");expect(document.fullscreenElement).toBeNull();
});
it("falls back to an expanded map when native fullscreen is unavailable and Escape restores scrolling",async()=>{
  Object.defineProperty(host.querySelector("section"),"requestFullscreen",{configurable:true,value:vi.fn().mockRejectedValue(new Error("Unsupported"))});
  await act(async()=>host.querySelector("button")!.click());expect(document.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();expect(document.body.style.overflow).toBe("hidden");
  act(()=>window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"})));expect(document.querySelector(".factory-expanded")).toBeNull();expect(document.body.style.overflow).toBe("");
});
