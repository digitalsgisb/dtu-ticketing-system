import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { Badge, Empty, ErrorNotice, Loading } from "../components/UI";
import { useLiveRefresh } from "../live";
import "./monthly-review.css";

const categories = ["AI", "IoT", "Software", "Automation", "Infrastructure", "Other"];
type Item = { id: number; project_no?: string; request_no?: string; name?: string; title?: string; description?: string;
  department_name: string; reporting_category: string; owner_name?: string; requester_name?: string; status: string | null;
  progress: number | null; baseline_progress?: number | null; current_update?: string; next_action?: string;
  desired_outcome?: string; due_date?: string; target_date?: string; start_date?: string; image_id?: number;
  month_updates?: number; is_new?: number; snapshot_at?: string; created_at: string };
type Report = { month: string; projects: Item[]; plans: Item[]; requests: Item[] };
const currentMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
const accent: Record<string, string> = { AI: "#8260dc", IoT: "#129d97", Software: "#4384d5", Automation: "#d78b35", Infrastructure: "#63738b", Other: "#6e9296" };

export function MonthlyReviewPage() {
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get("month") || "") ? params.get("month")! : currentMonth();
  const tab = ["progress", "requests", "plans"].includes(params.get("view") || "") ? params.get("view")! : "progress";
  const category = params.get("category") || "all";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("activity");
  const [presenting, setPresenting] = useState(false);
  const [slide, setSlide] = useState(0);
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  const presentButton = useRef<HTMLButtonElement>(null);
  const presentationActive = useRef(presenting);
  const selectedMonth = useRef(month);
  presentationActive.current = presenting;
  selectedMonth.current = month;
  const load = async () => {
    if (presentationActive.current) return;
    const request = ++generation.current;
    try {
      const next = await api<Report>(`/api/staff/monthly-review?month=${selectedMonth.current}`);
      if (request === generation.current && !presentationActive.current) { setData(next); setError(""); }
    } catch (err) { if (request === generation.current) setError((err as Error).message); }
  };
  useEffect(() => { void load(); return () => { generation.current++; }; }, [month]);
  useLiveRefresh(load);
  useEffect(() => {
    document.title = "Monthly Review · DTU";
    return () => { document.title = "DTU Control Centre"; };
  }, []);
  useEffect(() => {
    if (!presenting) return;
    document.body.classList.add("monthly-presenting");
    return () => { document.body.classList.remove("monthly-presenting"); presentButton.current?.focus(); };
  }, [presenting]);
  const change = (key: string, value: string) => { setParams(previous => { const next = new URLSearchParams(previous); next.set(key, value); return next; }); setSlide(0); };
  const monthProjects = data?.projects.filter(p => p.month_updates || p.is_new) ?? [];
  const source = tab === "requests" ? data?.requests : tab === "plans" ? data?.plans : scope === "activity" ? monthProjects : data?.projects;
  const items = (source ?? []).filter(p => (category === "all" || p.reporting_category === category)
    && `${p.name || p.title} ${p.project_no || p.request_no} ${p.department_name} ${p.owner_name || p.requester_name || ""}`.toLowerCase().includes(search.toLowerCase()));
  const index = Math.min(slide, Math.max(0, items.length - 1));
  useEffect(() => {
    if (!presenting) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const buttons = Array.from(document.querySelectorAll<HTMLElement>('.mr-presentation button:not(:disabled), .mr-presentation a[href]'));
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if (event.target instanceof Element && event.target.matches("input,select,textarea")) return;
      if (["Escape", "ArrowRight", "ArrowLeft"].includes(event.key)) event.preventDefault();
      if (event.key === "Escape") setPresenting(false);
      if (event.key === "ArrowRight") setSlide(i => Math.min(i + 1, items.length - 1));
      if (event.key === "ArrowLeft") setSlide(i => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [presenting, items.length]);
  const saveCategory = async (item: Item, value: string) => {
    setSaving(true);
    try { await api("/api/staff/monthly-review/category", json("PATCH", { kind: tab === "requests" ? "request" : "project", id: item.id, category: value })); await load(); }
    catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };
  const label = new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00+08:00`));
  if (!data && !error) return <Loading />;
  const ready = data?.month === month;
  const delivered = monthProjects.filter(p => p.progress === 100 && p.month_updates && p.baseline_progress !== 100).length;

  return <div className={`monthly-review${presenting ? " is-presenting" : ""}`}><div inert={presenting}>
    <header className="mr-heading"><div><span className="mr-kicker">DTU / MANAGEMENT MEETING</span><h1>Monthly Review<span>.</span></h1><p>The work behind the progress. The plan for what’s next.</p></div>
      <div className="mr-actions"><button className="button button-secondary" onClick={() => window.print()}>Print / Save PDF</button><button ref={presentButton} className="button button-primary" disabled={!ready || !items.length} onClick={() => setPresenting(true)}>Present review ↗</button></div>
    </header>
    <ErrorNotice message={error} />
    <section className="mr-hero"><div><span className="mr-kicker">THE MONTH IN MOTION</span><h2>{label}</h2><p>A clear view of delivery, new demand, and the road ahead.</p><label className="mr-month">Reporting month <input aria-label="Reporting month" type="month" min="2000-01" max="2099-12" value={month} onChange={e => e.target.value && change("month", e.target.value)} /></label></div>
    </section>
    {!ready ? <Loading /> : <>
    <section className="mr-metrics" aria-label="Review summary">
      {[["01", monthProjects.length, "Projects with activity", "Created or updated this month"], ["02", delivered, "Reached 100%", "Recorded in progress updates"], ["03", data!.requests.length, "Open requests", "Current intake · live"], ["04", data!.plans.length, "Planned projects", "Current roadmap · live"]].map(([number, value, title, note]) => <article key={number}><span>{number} /</span><strong>{value}</strong><h3>{title}</h3><small>{note}</small></article>)}
    </section>
    <nav className="mr-tabs" aria-label="Review sections">{[["progress", "Monthly progress", monthProjects.length], ["requests", "Request pipeline", data!.requests.length], ["plans", "What’s next", data!.plans.length]].map(([value, title, count]) => <button key={value} aria-pressed={tab === value} className={tab === value ? "active" : ""} onClick={() => change("view", String(value))}>{title}<span>{count}</span></button>)}</nav>
    <div className="mr-section-heading"><div><span className="mr-kicker">{tab === "progress" ? "DELIVERY JOURNAL" : tab === "requests" ? "DEMAND & DECISIONS" : "THE ROAD AHEAD"}</span><h2>{tab === "progress" ? "Progress, project by project" : tab === "requests" ? "Ideas waiting for their next step" : "From today’s plans to tomorrow’s progress"}</h2></div><span>{items.length} {items.length === 1 ? "item" : "items"}</span></div>
    <p className="mr-context">{tab === "progress" ? "Progress and notes use the last recorded update before month end (Malaysia time). Missing history is marked as unrecorded. Project details and categories reflect current settings." : "Live pipeline for your next discussion. These items reflect current status, independent of the reporting month."}</p>
    <div className="mr-controls"><div className="mr-categories" aria-label="Category filter">{["all", ...categories].map(c => <button aria-pressed={category === c} className={category === c ? "active" : ""} key={c} onClick={() => change("category", c)}>{c === "all" ? "All categories" : c}</button>)}</div><div className="mr-search"><input aria-label="Search review" placeholder="Search projects, people…" value={search} onChange={e => { setSearch(e.target.value); setSlide(0); }} />{tab === "progress" && <select aria-label="Project scope" value={scope} onChange={e => { setScope(e.target.value); setSlide(0); }}><option value="activity">This month’s activity</option><option value="portfolio">Portfolio at month end</option></select>}</div></div>
    {items.length ? <div className="mr-grid">{items.map((item, i) => <ReviewCard key={item.id} item={item} tab={tab} number={i + 1} onCategory={value => void saveCategory(item, value)} saving={saving} />)}</div> : <Empty title="Nothing in this view yet" body={tab === "progress" ? "Publish a dated project progress update, choose another month, or switch to the full portfolio." : "Try another category or add a project through the project portfolio."} />}
    <footer className="mr-footer"><strong>DTU · Monthly Review</strong><span>{label} / {tab === "progress" ? "Recorded project progress" : "Live planning pipeline"}</span></footer>
    </>}</div>
    {presenting && ready && <section className="mr-presentation" role="dialog" aria-modal="true" aria-label="Monthly review presentation"><header><div><span className="mr-kicker">DTU · {label}</span><h2>{tab === "progress" ? "Monthly progress" : tab === "plans" ? "What’s next" : "Request pipeline"}</h2></div><button autoFocus className="button button-secondary" onClick={() => setPresenting(false)}>Exit presentation ×</button></header><div className="mr-slide" key={items[index]?.id}>{items[index] ? <ReviewCard item={items[index]} tab={tab} number={index + 1} /> : <Empty title="No items in this view" />}</div><footer><button className="button button-secondary" disabled={index === 0} onClick={() => setSlide(index - 1)}>← Previous</button><span>{items.length ? index + 1 : 0} / {items.length} <small> · Use ← → keys · Esc to exit</small></span><button className="button button-primary" disabled={index >= items.length - 1} onClick={() => setSlide(index + 1)}>Next project →</button></footer></section>}
  </div>;
}

function ReviewCard({ item, tab, number, onCategory, saving }: { item: Item; tab: string; number: number; onCategory?: (value: string) => void; saving?: boolean }) {
  const progress = item.progress;
  const delta = progress !== null && item.baseline_progress != null ? progress - item.baseline_progress : null;
  const request = tab === "requests";
  return <article className="mr-card" style={{ "--category-color": accent[item.reporting_category] || accent.Other } as CSSProperties}>
    <div className={`mr-card-visual${item.image_id ? " has-image" : ""}`}>{item.image_id ? <img src={`/api/staff/briefing/images/${item.image_id}`} alt={`Progress evidence for ${item.name}`} /> : <div className="mr-card-pattern" aria-hidden="true"><span>{request ? "↗" : item.reporting_category === "AI" ? "✳" : item.reporting_category === "IoT" ? "◎" : "◈"}</span></div>}<span className="mr-category">{item.reporting_category}</span><span className="mr-card-index">{String(number).padStart(2, "0")}</span></div>
    <div className="mr-card-content"><div className="mr-card-meta"><span>{item.project_no || item.request_no}</span>{item.status ? <Badge value={item.status} /> : <span className="mr-unrecorded">No recorded status</span>}</div><h3>{item.name || item.title}</h3><p className="mr-department">{item.department_name} · {item.owner_name || item.requester_name || "Unassigned"}</p>
      {!request && <div className="mr-progress"><div><span>{tab === "progress" ? "Recorded delivery" : "Current delivery"}</span><strong>{progress == null ? "Unrecorded" : `${progress}%`}</strong></div><div className="mr-track"><i style={{ width: `${progress ?? 0}%` }} /></div><small>{tab === "progress" ? delta !== null ? `${delta > 0 ? "+" : ""}${delta} percentage points since last month` : "No prior-month baseline recorded" : `Start: ${formatDate(item.start_date)}`}</small></div>}
      <div className="mr-narrative"><span>{request ? "DESIRED OUTCOME" : tab === "plans" ? "THE PLAN" : "LATEST RECORDED UPDATE"}</span><p>{request ? item.desired_outcome : tab === "plans" ? item.current_update || item.description || "Add a project description to outline the plan." : item.current_update || "No progress update recorded by month end."}</p></div>
      {item.next_action && <div className="mr-next"><span>Next →</span><p>{item.next_action}</p></div>}
      <div className="mr-card-bottom"><span>{tab === "progress" ? `${item.month_updates || 0} ${item.month_updates === 1 ? "update" : "updates"} this month${item.is_new ? " · New project" : ""}` : `Target: ${formatDate(item.due_date || item.target_date)}`}</span><Link to={request ? `/requests/${item.id}` : `/briefing/${item.id}`}>Open {request ? "request" : "project"} ↗</Link></div>
      {onCategory && <label className="mr-category-editor">Category<select disabled={saving} aria-label={`Category for ${item.name || item.title}`} value={item.reporting_category} onChange={e => onCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>}
    </div>
  </article>;
}
