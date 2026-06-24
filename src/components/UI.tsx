import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { humanize } from "../api";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  );
}

export function Badge({ value, kind = "status" }: { value?: string | null; kind?: "status" | "priority" | "type" }) {
  const normalized = value ?? "unknown";
  return <span className={`badge badge-${kind} badge-${normalized}`}>{humanize(normalized)}</span>;
}

export function StatCard({ label, value, tone, icon, note, index = 0 }: { label: string; value: number | string; tone: string; icon: ReactNode; note?: string; index?: number }) {
  const [displayValue, setDisplayValue] = useState(typeof value === "number" ? 0 : value);

  useEffect(() => {
    if (typeof value !== "number") return setDisplayValue(value);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setDisplayValue(value);
    const started = performance.now();
    const duration = 650;
    let frame = 0;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      setDisplayValue(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <article className={`stat-card tone-${tone}`} style={{ "--card-index": index } as CSSProperties}>
      <div className="stat-card-top">
        <div className="stat-icon">{icon}</div>
        {note && <small>{note}</small>}
      </div>
      <div className="stat-card-value"><strong>{displayValue}</strong><span>{label}</span></div>
      <div className="stat-card-signal"><i /><i /><i /><i /><i /><i /></div>
    </article>
  );
}

export function Empty({ title = "Nothing here yet", body }: { title?: string; body?: string }) {
  return <div className="empty-state"><div className="empty-orbit">✦</div><strong>{title}</strong>{body && <p>{body}</p>}</div>;
}

export function Loading() {
  return <div className="loading"><span /><span /><span /></div>;
}

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}>
        <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close">×</button></header>
        {children}
      </section>
    </div>
  );
}

export function ErrorNotice({ message }: { message?: string }) {
  return message ? <div className="notice notice-error">{message}</div> : null;
}
