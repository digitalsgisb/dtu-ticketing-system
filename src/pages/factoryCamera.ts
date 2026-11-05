import { Vector3, type PerspectiveCamera } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Camera motion has its own frame loop, so Pause machinery still allows navigation.
export function createFactoryCameraMotion(camera: PerspectiveCamera, controls: OrbitControls, render: () => void) {
  let frame = 0;
  const cancel = () => { cancelAnimationFrame(frame); frame = 0; };
  controls.addEventListener("start", cancel);
  return {
    move(position: Vector3, target: Vector3, animate = true) {
      cancel();
      if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        camera.position.copy(position); controls.target.copy(target); controls.update(); render(); return;
      }
      const fromPosition = camera.position.clone(), fromTarget = controls.target.clone(), start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - start) / 650)), eased = t * t * (3 - 2 * t);
        camera.position.lerpVectors(fromPosition, position, eased); controls.target.lerpVectors(fromTarget, target, eased);
        controls.update(); render();
        frame = t < 1 ? requestAnimationFrame(step) : 0;
      };
      frame = requestAnimationFrame(step);
    },
    dispose() { cancel(); controls.removeEventListener("start", cancel); }
  };
}
