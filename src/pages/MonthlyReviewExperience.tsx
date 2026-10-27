import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Item } from "./MonthlyReview";
import { Empty } from "../components/UI";

export const reviewCategories = ["AI", "IoT", "Software", "Automation", "Infrastructure", "Other"];

/** Keep outgoing content until its fade finishes; rapid selections replace the pending destination. */
export function ReviewMotion({ viewKey, children, className = "", measure = true }: { viewKey: string; children: ReactNode; className?: string; measure?: boolean }) {
  const [shownKey, setShownKey] = useState(viewKey);
  const previous = useRef(children);
  const body = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => { if (shownKey === viewKey) previous.current = children; });
  useEffect(() => {
    if (shownKey === viewKey) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setShownKey(viewKey); return; }
    const timer = window.setTimeout(() => setShownKey(viewKey), 130);
    return () => window.clearTimeout(timer);
  }, [viewKey, shownKey]);
  useLayoutEffect(() => {
    if (!measure || !body.current) return;
    const element = body.current;
    const resize = () => setHeight(element.getBoundingClientRect().height);
    resize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [shownKey, measure]);
  return <div className={`mr-motion ${shownKey !== viewKey ? "is-leaving" : ""} ${className}`} style={measure && height ? { height } : undefined} aria-busy={shownKey !== viewKey}>
    <div className="mr-motion-body" ref={body} key={shownKey} inert={shownKey !== viewKey}>{shownKey === viewKey ? children : previous.current}</div>
  </div>;
}

export function ReviewSkeleton() {
  return <div className="mr-skeleton" role="status" aria-label="Loading monthly review"><span className="sr-only">Loading monthly review…</span>
    <div className="mr-skeleton-metrics">{[0, 1, 2, 3].map(i => <div key={i}><i /><i /></div>)}</div>
    <div className="mr-skeleton-line" /><div className="mr-skeleton-cards">{[0, 1, 2].map(i => <div key={i}><i /><i /><i /></div>)}</div>
  </div>;
}

export function ReviewAnalysis({ items, tab, compact = false, onCategory }: { items: Item[]; tab: string; compact?: boolean; onCategory?: (category: string) => void }) {
  const recorded = items.filter(item => item.progress != null);
  const comparable = recorded.filter(item => item.baseline_progress != null && item.month_updates);
  const average = recorded.length ? Math.round(recorded.reduce((sum, item) => sum + item.progress!, 0) / recorded.length) : null;
  const gain = comparable.length ? Math.round(comparable.reduce((sum, item) => sum + item.progress! - item.baseline_progress!, 0) / comparable.length) : null;
  const updates = items.reduce((sum, item) => sum + (item.month_updates || 0), 0);
  const missing = items.filter(item => item.progress == null).length;
  const held = items.filter(item => item.status === "on_hold").length;
  const awaitingInfo = items.filter(item => item.status === "needs_information").length;
  const metrics = tab === "requests" ? [
    [items.length, "Open requests", "Current request pipeline"],
    [awaitingInfo, "Need information", "Waiting for requester input"],
    [items.filter(item => item.status === "submitted").length, "Awaiting review", "Submitted requests"],
    [items.filter(item => item.status === "triage").length, "Under review", "Requests in triage"]
  ] : [
    [average == null ? "—" : `${average}%`, "Average delivery", `${recorded.length} of ${items.length} projects have recorded progress`],
    [tab === "progress" ? gain == null ? "—" : `${gain > 0 ? "+" : ""}${gain} pp` : items.length, tab === "progress" ? "Average monthly gain" : "Planned projects", tab === "progress" ? `${comparable.length} projects with a prior-month baseline` : "Current planning pipeline"],
    [tab === "progress" ? updates : items.filter(item => item.owner_name).length, tab === "progress" ? "Progress updates" : "Owners assigned", tab === "progress" ? "Published in the reporting month" : "Named delivery owner"],
    [tab === "progress" ? held : items.filter(item => !item.start_date).length, tab === "progress" ? "On hold" : "Start date unset", tab === "progress" ? "Recorded status · needs discussion" : "Scheduling still to be confirmed"]
  ];
  return <section className={`mr-analysis${compact ? " is-compact" : ""}`} aria-label="Progress analysis">
    {!compact && <><span className="mr-kicker">THE MANAGEMENT PICTURE</span><h2>From activity to outcomes.</h2><p className="mr-analysis-intro">{items.length} {tab === "requests" ? "requests in the current pipeline" : `projects in this ${tab === "progress" ? "reporting" : "planning"} view`}. {tab === "progress" ? "Analysis uses recorded updates, with missing history kept visible." : "This pipeline reflects current status, independent of the reporting month."}</p></>}
    <div className="mr-analysis-metrics">{metrics.map(([value, title, note]) => <article key={title}><strong>{value}</strong><h3>{title}</h3><small>{note}</small></article>)}</div>
    {!compact && <div className="mr-analysis-detail"><div className="mr-category-breakdown"><h3>Where the work sits</h3><p>Choose a category to start its project walkthrough.</p>{reviewCategories.map(category => {
      const count = items.filter(item => item.reporting_category === category).length;
      return <button key={category} disabled={!count} onClick={() => onCategory?.(category)}><span>{category}</span><i><b style={{ width: `${items.length ? count / items.length * 100 : 0}%` }} /></i><strong>{count}</strong></button>;
    })}</div><aside className="mr-discussion"><span className="mr-kicker">DISCUSSION POINTS</span><h3>What needs a conversation?</h3>{!items.length ? <p>No items in this view yet.</p> : tab === "progress" ? <>
      <p><strong>{held}</strong> {held === 1 ? "project is" : "projects are"} recorded as on hold.</p>
      <p><strong>{missing}</strong> {missing === 1 ? "project has" : "projects have"} no recorded delivery percentage.</p>
      <p><strong>{items.filter(item => !item.next_action).length}</strong> projects have no next action recorded.</p>
      <small>Progress gain is an average of comparable projects, not a total portfolio increase.</small>
    </> : tab === "requests" ? <><p><strong>{awaitingInfo}</strong> requests need more information before the next decision.</p><p>Use the category rail to review demand and agree the next step.</p></> : <><p><strong>{items.filter(item => !item.start_date).length}</strong> planned projects have no start date.</p><p>Use the walkthrough to agree priorities, owners, and next actions.</p></>}</aside></div>}
  </section>;
}

export function ReviewPresentation({ pool, tab, label, initialCategory, onClose, renderItem }: { pool: Item[]; tab: string; label: string; initialCategory: string; onClose: () => void; renderItem: (item: Item, number: number) => ReactNode }) {
  const [selected, setSelected] = useState("overview");
  const [slide, setSlide] = useState(0);
  const rail = useRef<HTMLElement>(null);
  const options = ["overview", "all", ...reviewCategories];
  const items = pool.filter(item => selected === "all" || item.reporting_category === selected);
  const index = Math.max(0, Math.min(slide, items.length - 1));
  const select = (category: string) => { setSelected(category); setSlide(0); };
  const start = () => select(initialCategory !== "all" && pool.some(item => item.reporting_category === initialCategory) ? initialCategory : "all");
  const allLabel = tab === "requests" ? "All requests" : "All projects";
  useEffect(() => {
    const nav = rail.current;
    if (!nav) return;
    const reveal = () => {
      const active = nav.querySelector<HTMLElement>('button[aria-pressed="true"]');
      if (!active || nav.scrollWidth <= nav.clientWidth) return;
      nav.scrollTo?.({ left: Math.max(0, active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2), behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    };
    reveal();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(reveal); observer.observe(nav);
    return () => observer.disconnect();
  }, [selected]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const buttons = Array.from(document.querySelectorAll<HTMLElement>('.mr-presentation button:not(:disabled), .mr-presentation a[href]')).filter(button => !button.closest("[inert]"));
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if (event.target instanceof Element && event.target.matches("input,select,textarea")) return;
      if (["Escape", "ArrowRight", "ArrowLeft"].includes(event.key)) event.preventDefault();
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") { if (selected === "overview") start(); else setSlide(i => Math.min(i + 1, Math.max(0, items.length - 1))); }
      if (event.key === "ArrowLeft") { if (index === 0) select("overview"); else setSlide(i => Math.max(0, i - 1)); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selected, items.length, index, onClose, initialCategory]);
  const activeIndex = options.indexOf(selected);
  return <section className="mr-presentation" role="dialog" aria-modal="true" aria-label="Monthly review presentation"><header><div><span className="mr-kicker">DTU · {label}</span><h2>{tab === "progress" ? "Monthly progress" : tab === "plans" ? "What’s next" : "Request pipeline"}</h2></div><button autoFocus className="button button-secondary" onClick={onClose}>Exit presentation ×</button></header>
    <div className="mr-presentation-layout"><aside className="mr-presentation-rail"><nav ref={rail} aria-label="Presentation categories" style={{ "--rail-index": activeIndex } as CSSProperties}><i className="mr-rail-indicator" aria-hidden="true" />{options.map(category => {
      const count = category === "overview" || category === "all" ? pool.length : pool.filter(item => item.reporting_category === category).length;
      return <button key={category} aria-pressed={selected === category} disabled={category !== "overview" && !count} onClick={() => select(category)}><span>{category === "overview" ? "Overview" : category === "all" ? allLabel : category}</span></button>;
    })}</nav></aside>
      <div className="mr-presentation-main" role="region" aria-label="Presentation content"><div className="mr-stage-caption"><span>{selected === "overview" ? "Overview & analysis" : selected === "all" ? allLabel : selected}</span><small>{selected === "overview" ? `${pool.length} items in this review` : `${items.length ? index + 1 : 0} of ${items.length}`}</small></div>
        <ReviewMotion viewKey={`${selected}-${items[index]?.id ?? "overview"}`} className="mr-stage-transition"><div className="mr-slide">{selected === "overview" ? <ReviewAnalysis items={pool} tab={tab} onCategory={select} /> : items[index] ? renderItem(items[index], index + 1) : <Empty title="No projects in this category" />}</div></ReviewMotion>
      </div></div>
    <footer><button className="button button-secondary" disabled={selected === "overview"} onClick={() => index === 0 ? select("overview") : setSlide(index - 1)}>← {index === 0 ? "Overview" : "Previous"}</button><span aria-live="polite">{selected === "overview" ? "Meeting overview" : `${selected === "all" ? allLabel : selected} · ${index + 1} / ${items.length}`}<small> · ← → to navigate · Esc to exit</small></span><button className="button button-primary" disabled={selected !== "overview" && index >= items.length - 1} onClick={() => selected === "overview" ? start() : setSlide(index + 1)}>{selected === "overview" ? "Start projects →" : "Next project →"}</button></footer>
  </section>;
}
