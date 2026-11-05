// Visibility changes must not restart the clock or strand a rebuilt scene paused.
export function createFactoryAnimationLoop(update: (seconds: number) => void) {
  let enabled = false, pageVisible = true, inViewport = true, disposed = false;
  let frame: number | null = null, seconds = 0, previous = 0;
  const running = () => enabled && pageVisible && inViewport && !disposed;
  const tick = (now: number) => {
    frame = null;
    if (!running()) return;
    seconds += Math.max(0, Math.min(.2, (now - previous) / 1000)); previous = now;
    update(seconds);
    if (running() && frame === null) frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    if (!running()) { if (frame !== null) cancelAnimationFrame(frame); frame = null; }
    else if (frame === null) { previous = performance.now(); frame = requestAnimationFrame(tick); }
  };
  return {
    setEnabled(value: boolean) { enabled = value; sync(); },
    setPageVisible(value: boolean) { pageVisible = value; sync(); },
    setInViewport(value: boolean) { inViewport = value; sync(); },
    dispose() { disposed = true; sync(); }
  };
}
