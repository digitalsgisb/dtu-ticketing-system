// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createFactoryAnimationLoop } from "../src/pages/factoryAnimation";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function setup() {
  let now=0,id=0;const pending=new Map<number,FrameRequestCallback>();
  vi.spyOn(performance,"now").mockImplementation(()=>now);
  vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{pending.set(++id,callback);return id;});
  vi.stubGlobal("cancelAnimationFrame",(frame:number)=>pending.delete(frame));
  const update=vi.fn(),loop=createFactoryAnimationLoop(update);
  const step=(time:number)=>{now=time;const callbacks=[...pending.values()];pending.clear();callbacks.forEach(callback=>callback(now));};
  return{loop,update,pending,step,setTime:(value:number)=>{now=value;}};
}
it("keeps one moving stream when repeated visibility and enabled notifications arrive",()=>{
  const run=setup();run.loop.setEnabled(true);run.setTime(80);run.loop.setEnabled(true);run.loop.setInViewport(true);run.loop.setPageVisible(true);
  expect(run.pending.size).toBe(1);run.step(100);expect(run.update).toHaveBeenLastCalledWith(.1);
  run.step(200);expect(run.update).toHaveBeenLastCalledWith(.2);run.loop.dispose();expect(run.pending.size).toBe(0);
});
it("resumes after scrolling and tab hiding without jumping or remaining stopped",()=>{
  const run=setup();run.loop.setEnabled(true);run.step(100);run.loop.setInViewport(false);expect(run.pending.size).toBe(0);
  run.setTime(10000);run.loop.setInViewport(true);run.step(10016);expect(run.update).toHaveBeenLastCalledWith(.116);
  run.loop.setPageVisible(false);expect(run.pending.size).toBe(0);run.setTime(20000);run.loop.setPageVisible(true);run.step(20016);expect(run.update.mock.lastCall![0]).toBeCloseTo(.132);
  run.loop.setEnabled(false);expect(run.pending.size).toBe(0);run.loop.dispose();
});
