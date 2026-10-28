// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CategoryBox } from "../src/components/CategoryBox";
import { api } from "../src/api";
vi.mock("../src/auth", () => ({ useAuth: () => ({ user: { role: "admin" } }) }));
vi.mock("../src/api", async original => ({ ...await original<typeof import("../src/api")>(), api: vi.fn() }));
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(api).mockReset().mockResolvedValue({ ok: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function choose(value: string) {
  const select = host.querySelector("select")!;
  await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
}
it.each(["project", "request"] as const)("saves the category for a %s without opening the surrounding card", async kind => {
  const open = vi.fn(), saved = vi.fn();
  await act(async () => root.render(<div onClick={open}><CategoryBox id={42} kind={kind} category="Other" name="Safety" onSaved={saved} /></div>));
  await act(async () => host.querySelector("select")!.click());
  expect(open).not.toHaveBeenCalled();
  await choose("AI");
  const call = vi.mocked(api).mock.calls[0];
  expect(JSON.parse(String(call[1]?.body))).toEqual({ kind, id: 42, category: "AI" });
  expect(host.querySelector("select")?.value).toBe("AI");
  expect(saved).toHaveBeenCalledOnce();
});
it("keeps the saved category when a change fails", async () => {
  await act(async () => root.render(<CategoryBox id={42} category="Software" />));
  vi.mocked(api).mockRejectedValueOnce(new Error("Could not save category"));
  await choose("IoT");
  expect(host.querySelector("select")?.value).toBe("Software");
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("Could not save category");
});
