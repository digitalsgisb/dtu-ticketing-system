// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createFactoryCameraMotion } from "../src/pages/factoryCamera";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function setup(reduced=false) {
  const frames=new Map<number,FrameRequestCallback>();let sequence=0;
  vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{frames.set(++sequence,callback);return sequence;});
  vi.stubGlobal("cancelAnimationFrame",(id:number)=>frames.delete(id));
  vi.stubGlobal("matchMedia",()=>({matches:reduced}));vi.spyOn(performance,"now").mockReturnValue(0);
  const camera=new PerspectiveCamera(),target=new Vector3(),events=new EventTarget(),render=vi.fn();
  const controls={target,update:vi.fn(),addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)} as unknown as OrbitControls;
  const motion=createFactoryCameraMotion(camera,controls,render);
  const advance=(now:number)=>{const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(now));};
  return{motion,camera,target,render,events,advance,frames};
}
it("moves through intermediate positions and arrives without requiring a machinery animation loop",()=>{
  const run=setup();run.motion.move(new Vector3(20,30,40),new Vector3(4,5,6));
  expect(run.camera.position.length()).toBe(0);run.advance(325);
  expect(run.camera.position.x).toBeGreaterThan(0);expect(run.camera.position.x).toBeLessThan(20);
  run.advance(650);expect(run.camera.position.toArray()).toEqual([20,30,40]);expect(run.target.toArray()).toEqual([4,5,6]);expect(run.frames.size).toBe(0);run.motion.dispose();
});
it("lets manual navigation interrupt a transition and cancels frames on cleanup",()=>{
  const run=setup();run.motion.move(new Vector3(20,30,40),new Vector3());run.advance(200);
  const position=run.camera.position.clone();run.events.dispatchEvent(new Event("start"));run.advance(650);expect(run.camera.position.equals(position)).toBe(true);
  run.motion.move(new Vector3(1,2,3),new Vector3());run.motion.dispose();expect(run.frames.size).toBe(0);
});
it("respects reduced-motion preferences",()=>{
  const run=setup(true);run.motion.move(new Vector3(20,30,40),new Vector3(4,5,6));expect(run.camera.position.toArray()).toEqual([20,30,40]);expect(run.frames.size).toBe(0);run.motion.dispose();
});
