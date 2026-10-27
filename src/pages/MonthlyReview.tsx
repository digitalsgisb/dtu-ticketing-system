import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { Badge, Empty, ErrorNotice } from "../components/UI";
import { useLiveRefresh } from "../live";
import "./monthly-review.css";
import { ProjectDetailsDialog, ProjectGroupManager, ProjectOverviewTable, type PortfolioSelection, type ProjectGroup } from "./MonthlyReviewPortfolio";

import { reviewCategories as categories, ReviewAnalysis, ReviewMotion, ReviewPresentation, ReviewSkeleton } from "./MonthlyReviewExperience";
export type Item = { id: number; group_id?: number | null; links?: { id: number; title: string; url: string }[]; project_no?: string; request_no?: string; name?: string; title?: string; description?: string;
  department_name: string; reporting_category: string; owner_name?: string; requester_name?: string; status: string | null;
  progress: number | null; baseline_progress?: number | null; current_update?: string; next_action?: string;
  desired_outcome?: string; due_date?: string; target_date?: string; start_date?: string; image_id?: number;
  month_updates?: number; is_new?: number; snapshot_at?: string; created_at: string };
type Report = { portfolio: Item[]; groups: ProjectGroup[]; month: string; projects: Item[]; currentProjects: Item[]; plans: Item[]; requests: Item[] };
const currentMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
const accent: Record<string, string> = { AI: "#8260dc", IoT: "#129d97", Software: "#4384d5", Automation: "#d78b35", Infrastructure: "#63738b", Other: "#6e9296" };

export function MonthlyReviewPage() {
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get("month") || "") ? params.get("month")! : currentMonth();
  const tab = ["portfolio", "progress", "current", "requests", "plans"].includes(params.get("view") || "") ? params.get("view")! : "progress";
  const category = ["all", ...categories].includes(params.get("category") || "") ? params.get("category")! : "all";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("activity");
  const [presenting, setPresenting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [selection, setSelection] = useState<PortfolioSelection | null>(null);
  const [layout, setLayout] = useState("cards");
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
  const change = (key: string, value: string) => { setParams(previous => { const next = new URLSearchParams(previous); next.set(key, value); return next; }); };
  const monthProjects = data?.projects.filter(p => p.month_updates || p.is_new) ?? [];
  const source = tab === "portfolio" ? data?.portfolio : tab === "requests" ? data?.requests : tab === "plans" ? data?.plans : tab === "current" ? data?.currentProjects : scope === "activity" ? monthProjects : data?.projects;
  const groupNames = new Map((data?.groups ?? []).map(group => [group.id, group.name]));
  const pool = (source ?? []).filter(p => `${p.group_id ? groupNames.get(p.group_id) || "" : ""} ${p.name || p.title} ${p.project_no || p.request_no} ${p.department_name} ${p.owner_name || p.requester_name || ""}`.toLowerCase().includes(search.toLowerCase()));
  const items = pool.filter(p => category === "all" || p.reporting_category === category);
  const saveCategory = async (item: Item, value: string) => {
    setSaving(true);
    try { await api("/api/staff/monthly-review/category", json("PATCH", { kind: tab === "requests" ? "request" : "project", id: item.id, category: value })); await load(); }
    catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };
  const label = new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00+08:00`));
  const ready = data?.month === month;
  const delivered = monthProjects.filter(p => p.progress === 100 && p.month_updates && p.baseline_progress !== 100).length;

  return <div className={`monthly-review${presenting ? " is-presenting" : ""}`}><div inert={presenting || showGroups || selection !== null}>
    <header className="mr-heading"><div><span className="mr-kicker">DTU / MANAGEMENT MEETING</span><h1>Monthly Review<span>.</span></h1><p>The work behind the progress. The plan for what’s next.</p></div>
      <div className="mr-actions"><button className="button button-secondary" disabled={!ready} onClick={() => setShowGroups(true)}>Group projects</button><button ref={presentButton} className="button button-primary" disabled={!ready} onClick={() => setPresenting(true)}>Present review ↗</button></div>
    </header>
    <ErrorNotice message={error} />
    <section className="mr-hero"><div><span className="mr-kicker">THE MONTH IN MOTION</span><h2>{label}</h2><p>A clear view of delivery, new demand, and the road ahead.</p><label className="mr-month">Reporting month <input aria-label="Reporting month" type="month" min="2000-01" max="2099-12" value={month} onChange={e => e.target.value && change("month", e.target.value)} /></label></div>
    </section>
    <ReviewMotion viewKey={`${month}-${ready ? "ready" : error ? "error" : "loading"}`} className="mr-report-content" measure={false}>{!ready ? error ? <div className="mr-load-error"><Empty title="The review could not be loaded" body="Your reporting month is still selected. Retry to load its progress." /><button className="button button-secondary" onClick={() => void load()}>Retry loading review</button></div> : <ReviewSkeleton /> : <>
    <section className="mr-metrics" aria-label="Review summary">
      {[["01", monthProjects.length, "Projects with activity", "Created or updated this month"], ["02", delivered, "Reached 100%", "Recorded in progress updates"], ["03", data!.requests.length, "Open requests", "Current intake · live"], ["04", data!.plans.length, "Planned projects", "Current roadmap · live"]].map(([number, value, title, note]) => <article key={number}><span>{number} /</span><strong>{value}</strong><h3>{title}</h3><small>{note}</small></article>)}
    </section>
    <nav className="mr-tabs" aria-label="Review sections">{[["portfolio", "Project overview", data!.portfolio?.length ?? 0], ["progress", "Monthly progress", monthProjects.length], ["current", "Current projects", data!.currentProjects?.length ?? 0], ["requests", "Request pipeline", data!.requests.length], ["plans", "Future plans", data!.plans.length]].map(([value, title, count]) => <button key={value} aria-pressed={tab === value} className={tab === value ? "active" : ""} onClick={() => change("view", String(value))}>{title}<span>{count}</span></button>)}</nav>
    <div className="mr-section-heading"><div><span className="mr-kicker">{tab === "portfolio" ? "THE COMPLETE PORTFOLIO" : tab === "progress" ? "DELIVERY JOURNAL" : tab === "current" ? "IN DELIVERY TODAY" : tab === "requests" ? "DEMAND & DECISIONS" : "THE ROAD AHEAD"}</span><h2>{tab === "portfolio" ? "All projects at a glance" : tab === "progress" ? "Progress, project by project" : tab === "current" ? "Everything currently in motion" : tab === "requests" ? "Ideas waiting for their next step" : "From today’s plans to tomorrow’s progress"}</h2></div><span>{items.length} {items.length === 1 ? "item" : "items"}</span></div>
    <p className="mr-context">{tab === "portfolio" ? "Live overview of every project. Select a project or group for details and system links. Grouping reflects current settings." : tab === "progress" ? "Progress and notes use the last recorded update before month end (Malaysia time). Missing history is marked as unrecorded. Project details and categories reflect current settings." : tab === "current" ? "Live portfolio: projects in progress, on hold, or under monitoring, including projects without an update this month. Independent of the reporting month." : "Live pipeline for your next discussion. These items reflect current status, independent of the reporting month."}</p>
    <div className="mr-controls"><div className="mr-categories" aria-label="Category filter">{["all", ...categories].map(c => <button aria-pressed={category === c} className={category === c ? "active" : ""} key={c} onClick={() => change("category", c)}>{c === "all" ? "All categories" : c}</button>)}</div><div className="mr-search"><input aria-label="Search review" placeholder="Search projects, people…" value={search} onChange={e => { setSearch(e.target.value); }} />{tab === "progress" && <select aria-label="Project scope" value={scope} onChange={e => { setScope(e.target.value); }}><option value="activity">This month’s activity</option><option value="portfolio">Portfolio at month end</option></select>}</div></div>
    {tab !== "requests" && tab !== "portfolio" && <div className="mr-layout-switch" aria-label="Project display"><button aria-pressed={layout === "cards"} onClick={() => setLayout("cards")}>Cards</button><button aria-pressed={layout === "table"} onClick={() => setLayout("table")}>Overview table</button></div>}
    <ReviewMotion viewKey={`${tab}-${category}-${scope}-${search}-${layout}`} className="mr-results"><ReviewAnalysis items={items} tab={tab} compact />
    {tab === "portfolio" || (tab !== "requests" && layout === "table") ? <ProjectOverviewTable items={items} groups={data!.groups ?? []} onOpen={setSelection} /> : items.length ? <div className="mr-grid">{items.map((item, i) => <ReviewCard key={item.id} item={item} tab={tab} onOpen={() => setSelection({ kind: "project", id: item.id })} groupName={item.group_id ? groupNames.get(item.group_id) : undefined} number={i + 1} onCategory={value => void saveCategory(item, value)} saving={saving} />)}</div> : <Empty title="Nothing in this view yet" body={tab === "progress" ? "Publish a dated project progress update, choose another month, or switch to the full portfolio." : "Try another category or add a project through the project portfolio."} />}
    </ReviewMotion>
    <footer className="mr-footer"><strong>DTU · Monthly Review</strong><span>{label} / {tab === "progress" ? "Recorded project progress" : tab === "current" || tab === "portfolio" ? "Live project portfolio" : "Live planning pipeline"}</span></footer>
    </>}</ReviewMotion></div>
    {presenting && ready && <ReviewPresentation blocked={selection !== null} sections={{ portfolio: data!.portfolio ?? [], progress: monthProjects, current: data!.currentProjects ?? [], plans: data!.plans, requests: data!.requests }} initialTab={tab} label={label} initialCategory={category} onClose={() => setPresenting(false)} renderTable={(projects) => <ProjectOverviewTable items={projects} groups={data!.groups ?? []} onOpen={setSelection} />} renderItem={(item, number, section) => <ReviewCard item={item} tab={section} number={number} onOpen={() => setSelection({ kind: "project", id: item.id })} groupName={item.group_id ? groupNames.get(item.group_id) : undefined} />} />}
    {selection && <ProjectDetailsDialog selection={selection} portfolio={data?.portfolio ?? []} groups={data?.groups ?? []} onSelect={setSelection} onClose={() => setSelection(null)} />}
    {showGroups && <ProjectGroupManager portfolio={data?.portfolio ?? []} groups={data?.groups ?? []} onSaved={load} onClose={() => setShowGroups(false)} />}
  </div>;
}

function ReviewCard({ item, tab, number, onCategory, saving, onOpen, groupName }: { item: Item; tab: string; number: number; onCategory?: (value: string) => void; saving?: boolean; onOpen?: () => void; groupName?: string }) {
  const progress = item.progress;
  const delta = progress !== null && item.baseline_progress != null ? progress - item.baseline_progress : null;
  const request = tab === "requests";
  return <article className="mr-card" style={{ "--category-color": accent[item.reporting_category] || accent.Other } as CSSProperties}>
    <div className={`mr-card-visual${item.image_id ? " has-image" : ""}`}>{item.image_id ? <img src={`/api/staff/briefing/images/${item.image_id}`} alt={`Progress evidence for ${item.name}`} /> : <div className="mr-card-pattern" aria-hidden="true"><span>{request ? "↗" : item.reporting_category === "AI" ? "✳" : item.reporting_category === "IoT" ? "◎" : "◈"}</span></div>}<span className="mr-category">{item.reporting_category}</span><span className="mr-card-index">{String(number).padStart(2, "0")}</span></div>
    <div className="mr-card-content"><div className="mr-card-meta"><span>{item.project_no || item.request_no}</span>{item.status ? <Badge value={item.status} /> : <span className="mr-unrecorded">No recorded status</span>}</div><h3>{onOpen && !request ? <button className="mr-card-title-button" onClick={onOpen}>{item.name}</button> : item.name || item.title}</h3>{groupName && <span className="mr-card-group-label">Part of {groupName}</span>}<p className="mr-department">{item.department_name} · {item.owner_name || item.requester_name || "Unassigned"}</p>
      {!request && <div className="mr-progress"><div><span>{tab === "progress" ? "Recorded delivery" : "Current delivery"}</span><strong>{progress == null ? "Unrecorded" : `${progress}%`}</strong></div><div className="mr-track"><i style={{ width: `${progress ?? 0}%` }} /></div><small>{tab === "progress" ? delta !== null ? `${delta > 0 ? "+" : ""}${delta} percentage points since last month` : "No prior-month baseline recorded" : `Start: ${formatDate(item.start_date)}`}</small></div>}
      <div className="mr-narrative"><span>{request ? "DESIRED OUTCOME" : tab === "plans" ? "THE PLAN" : tab === "current" ? "LATEST PROGRESS UPDATE" : "LATEST RECORDED UPDATE"}</span><p>{request ? item.desired_outcome : tab === "plans" ? item.current_update || item.description || "Add a project description to outline the plan." : item.current_update || (tab === "current" ? "No progress update published yet." : "No progress update recorded by month end.")}</p></div>
      {item.next_action && <div className="mr-next"><span>Next →</span><p>{item.next_action}</p></div>}
      <div className="mr-card-bottom"><span>{tab === "progress" ? `${item.month_updates || 0} ${item.month_updates === 1 ? "update" : "updates"} this month${item.is_new ? " · New project" : ""}` : `Target: ${formatDate(item.due_date || item.target_date)}`}</span>{!request && onOpen ? <button className="mr-card-details" onClick={onOpen}>View details ↗</button> : <Link to={request ? `/requests/${item.id}` : `/briefing/${item.id}`}>Open {request ? "request" : "project"} ↗</Link>}</div>
      {onCategory && <label className="mr-category-editor">Category<select disabled={saving} aria-label={`Category for ${item.name || item.title}`} value={item.reporting_category} onChange={e => onCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>}
    </div>
  </article>;
}
