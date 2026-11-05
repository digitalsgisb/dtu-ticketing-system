import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FullscreenContext = createContext<{ active: boolean; toggle: () => void } | null>(null);

export function FactoryViewport({ children, label, className = "" }: { children: ReactNode; label: string; className?: string }) {
  const host = useRef<HTMLElement>(null);
  const [native, setNative] = useState(false), [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const change = () => setNative(document.fullscreenElement === host.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    host.current?.querySelector<HTMLElement>("[data-factory-fullscreen]")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setExpanded(false); }
      if (event.key !== "Tab") return;
      const items = [...(host.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,[tabindex="0"]') ?? [])].filter(item => item.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", key);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", key); queueMicrotask(() => host.current?.querySelector<HTMLElement>("[data-factory-fullscreen]")?.focus()); };
  }, [expanded]);
  const toggle = async () => {
    if (expanded) { setExpanded(false); return; }
    if (document.fullscreenElement === host.current) { await document.exitFullscreen(); return; }
    try {
      if (!host.current?.requestFullscreen) throw new Error("Fullscreen unavailable");
      await host.current.requestFullscreen();
    } catch { setExpanded(true); }
  };
  const surface = <section ref={host} className={`factory-viewport ${className}${expanded ? " factory-expanded" : ""}`} aria-label={label} role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined}>{children}</section>;
  return <FullscreenContext.Provider value={{ active: native || expanded, toggle: () => void toggle() }}>{expanded ? createPortal(surface, document.body) : surface}</FullscreenContext.Provider>;
}

export function FactoryFullscreenButton() {
  const fullscreen = useContext(FullscreenContext);
  return <button data-factory-fullscreen type="button" aria-pressed={fullscreen?.active ?? false} onClick={fullscreen?.toggle}>{fullscreen?.active ? "Exit fullscreen" : "Fullscreen"}</button>;
}
