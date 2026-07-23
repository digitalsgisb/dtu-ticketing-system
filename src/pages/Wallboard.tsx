import { useEffect, useRef, useState, type CSSProperties } from "react";
import { api, formatDate } from "../api";
import { AlertIcon, CheckIcon, ClockIcon, ProjectIcon } from "../components/Icons";
import { Badge, Loading, StatCard } from "../components/UI";
import { useI18n } from "../i18n";
import { CompanyLogo } from "../components/CompanyLogo";

type WallboardView = "overview" | "projects" | "tickets";
const completeLikeProjectStatuses = new Set(["complete_monitoring", "completed"]);
const wallboardPageSize = 4;

export function WallboardPage() {
  const { t, lang, setLang } = useI18n();
  const [data, setData] = useState<any>(null);
  const [now, setNow] = useState(new Date());
  const [newTicketIds, setNewTicketIds] = useState<Set<number>>(() => new Set());
  const [view, setView] = useState<WallboardView>("overview");
  const previousTicketIds = useRef<Set<number> | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const load = async () => {
    const next = await api<any>("/api/wallboard");
    const nextIds = new Set<number>(next.tickets.map((item: any) => Number(item.id)));
    if (previousTicketIds.current) {
      const arrivals = new Set([...nextIds].filter(id => !previousTicketIds.current?.has(id)));
      if (arrivals.size) {
        setNewTicketIds(arrivals);
        if (highlightTimer.current) clearTimeout(highlightTimer.current);
        highlightTimer.current = setTimeout(() => setNewTicketIds(new Set()), 2_600);
      }
    }
    previousTicketIds.current = nextIds;
    setData(next);
  };

  useEffect(() => {
    void load();
    const refreshTimer = setInterval(() => void load(), 30_000);
    const clockTimer = setInterval(() => setNow(new Date()), 1_000);
    return () => {
      clearInterval(refreshTimer);
      clearInterval(clockTimer);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  if (!data) return <div className="wallboard"><Loading /></div>;

  const locale = lang === "ms" ? "ms-MY" : "en-MY";
  const date = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(now);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now);
  const totalLive = data.stats.activeProjects + data.stats.openIssues;

  return <div className={`wallboard wallboard-view-${view}`}>
    <div className="wallboard-atmosphere"><i /><i /><i /></div>
    <header className="wallboard-header">
      <div className="brand company-brand wallboard-brand"><CompanyLogo /><small>DTU Control Centre · {t("controlCentre")}</small></div>
      <div className="wallboard-clock"><strong>{time}</strong><span>{date}</span><small>{t("lastUpdated")}: {new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(data.generatedAt))}</small></div>
      <button className="language-button" onClick={() => setLang(lang === "en" ? "ms" : "en")}>{t("language")}</button>
    </header>

    {view === "overview"
      ? <div className="wallboard-shell">
        <main className="wallboard-main">
          <WallboardCommand totalLive={totalLive} generatedAt={data.generatedAt} />
          <WallboardStats data={data} t={t} />
          <WallboardTicker data={data} />
          <section className="wall-panel wall-priority-panel">
            <WallHeading index="01" eyebrow="OPERATIONS" title={t("criticalWork")} count={`${data.tickets.length} queued`} actionLabel="View all →" onClick={() => setView("tickets")} />
            {data.tickets.length
              ? <CyclingTickets tickets={data.tickets} newTicketIds={newTicketIds} />
              : <WallClearState label="Priority queue clear" body="No open work is competing for attention." />}
          </section>
        </main>

        <aside className="wall-panel wall-portfolio-panel">
          <WallHeading index="02" eyebrow="PORTFOLIO" title={t("projectPortfolio")} count={`${data.projects.length} tracked`} actionLabel="View all →" onClick={() => setView("projects")} />
          {data.projects.length
            ? <CyclingProjects projects={data.projects} />
            : <WallClearState label="Portfolio clear" body="No active, monitoring, or completed projects require display." />}
        </aside>
      </div>
      : <WallboardFullView view={view} data={data} t={t} newTicketIds={newTicketIds} onBack={() => setView("overview")} />}

    <footer className="wallboard-footer"><span className="status-dot" /> Systems operational <span>•</span> {t("refreshes")} <span>•</span> Secure local display</footer>
    <div className="wallboard-watermark">© DIGITAL TRANSFORMATION UNIT</div>
  </div>;
}

function useWallboardCycle(itemCount: number, intervalMs: number) {
  const pageCount = Math.ceil(itemCount / wallboardPageSize);
  const [page, setPage] = useState(0);
  const [animate, setAnimate] = useState(true);
  const resetFrames = useRef<number[]>([]);

  const enableAnimationAfterReset = () => {
    const first = requestAnimationFrame(() => {
      const second = requestAnimationFrame(() => {
        setAnimate(true);
        resetFrames.current = [];
      });
      resetFrames.current.push(second);
    });
    resetFrames.current.push(first);
  };

  useEffect(() => {
    setAnimate(false);
    setPage(0);
    enableAnimationAfterReset();
    return () => {
      resetFrames.current.forEach(frame => cancelAnimationFrame(frame));
      resetFrames.current = [];
    };
  }, [itemCount]);

  useEffect(() => {
    if (pageCount <= 1) return;
    const timer = setInterval(() => setPage(current => current + 1), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, pageCount]);

  const finishTransition = () => {
    if (page !== pageCount) return;
    setAnimate(false);
    setPage(0);
    enableAnimationAfterReset();
  };

  return { page, pageCount, animate, finishTransition };
}

function pageItems<T>(items: T[]) {
  return Array.from({ length: Math.ceil(items.length / wallboardPageSize) }, (_, page) =>
    items.slice(page * wallboardPageSize, (page + 1) * wallboardPageSize));
}

function useWallboardFade(itemCount: number, intervalMs: number) {
  const pageCount = Math.ceil(itemCount / wallboardPageSize);
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [itemCount]);
  useEffect(() => {
    if (pageCount <= 1) return;
    const timer = setInterval(() => setPage(current => (current + 1) % pageCount), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, pageCount]);

  return { page, pageCount };
}

function CyclingTickets({ tickets, newTicketIds }: { tickets: any[]; newTicketIds: Set<number> }) {
  const pages = pageItems(tickets);
  const { page, pageCount, animate, finishTransition } = useWallboardCycle(tickets.length, 8_000);
  const renderedPages = pageCount > 1 ? [...pages, pages[0]] : pages;
  return <div className="wall-cycle wall-cycle-priority">
    <div
      className={`wall-cycle-track${animate ? "" : " wall-cycle-track-reset"}`}
      style={{ transform: `translate3d(-${page * 100}%, 0, 0)` }}
      onTransitionEnd={event => { if (event.target === event.currentTarget) finishTransition(); }}
    >
      {renderedPages.map((items, pageIndex) => <div className="wall-cycle-page wall-priority-grid" key={`${pageIndex}-${items[0]?.id ?? "empty"}`}>
        {items.map(item => {
          const index = tickets.findIndex(ticket => ticket.id === item.id);
          return <WallTicket key={item.id} item={item} index={index} isNew={newTicketIds.has(Number(item.id))} />;
        })}
      </div>)}
    </div>
    <CyclePosition page={page} pageCount={pageCount} />
  </div>;
}

function CyclingProjects({ projects }: { projects: any[] }) {
  const pages = pageItems(projects);
  const { page, pageCount } = useWallboardFade(projects.length, 10_000);
  return <div className="wall-cycle wall-cycle-projects">
    <div className="wall-project-fade-stage">
      {pages.map((items, pageIndex) => <div
        className={`wall-cycle-page wall-project-rail${pageIndex === page ? " wall-project-page-active" : ""}`}
        aria-hidden={pageIndex !== page}
        key={`${pageIndex}-${items[0]?.id ?? "empty"}`}
      >
        {items.map(project => <WallProject key={project.id} project={project} showcase />)}
      </div>)}
    </div>
    <CyclePosition page={page} pageCount={pageCount} />
  </div>;
}

function CyclePosition({ page, pageCount }: { page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  const visiblePage = page === pageCount ? 0 : page;
  return <div className="wall-cycle-position" aria-hidden="true">
    <span>{String(visiblePage + 1).padStart(2, "0")} / {String(pageCount).padStart(2, "0")}</span>
    <i key={visiblePage} />
  </div>;
}

function WallboardCommand({ totalLive, generatedAt }: { totalLive: number; generatedAt: string }) {
  return <section className="wallboard-command">
    <div className="wallboard-command-copy"><span>Operations overview</span><h1>Digital Transformation Unit Task Board</h1><p>Live delivery, service demand, and priority work across the unit.</p></div>
    <div className="wallboard-command-summary"><small>Live workload</small><strong>{totalLive}</strong><span>items in motion</span></div>
    <div className="wallboard-command-readout">
      <span>Next refresh</span>
      <div className="refresh-track" key={generatedAt}><i /></div>
      <small>Automatic · 30 seconds</small>
    </div>
  </section>;
}

function WallboardStats({ data, t }: { data: any; t: ReturnType<typeof useI18n>["t"] }) {
  return <section className="stat-grid wallboard-stats">
    <StatCard label={t("activeProjects")} value={data.stats.activeProjects} tone="blue" note="Delivery portfolio" index={0} icon={<ProjectIcon />} />
    <StatCard label={t("openIssues")} value={data.stats.openIssues} tone="amber" note="Service demand" index={1} icon={<AlertIcon />} />
    <StatCard label={t("overdue")} value={data.stats.overdue} tone="red" note="Needs attention" index={2} icon={<ClockIcon />} />
    <StatCard label="Completed this month" value={data.stats.completedMonth} tone="green" note="Monthly output" index={3} icon={<CheckIcon />} />
  </section>;
}

function WallboardTicker({ data }: { data: any }) {
  return <div className="wallboard-ticker"><div><span>LIVE</span><b>{data.stats.activeProjects} active projects</b><i /><b>{data.stats.openIssues} open issues</b><i /><b>{data.stats.overdue} overdue items</b><i /><b>{data.stats.completedMonth} completed this month</b><i /><b>DTU operations online</b></div></div>;
}

function WallboardFullView({ view, data, t, newTicketIds, onBack }: {
  view: Exclude<WallboardView, "overview">;
  data: any;
  t: ReturnType<typeof useI18n>["t"];
  newTicketIds: Set<number>;
  onBack: () => void;
}) {
  const projects = view === "projects";
  return <main className="wallboard-full-view">
    <section className="wallboard-command wallboard-focus-command">
      <div className="wallboard-command-copy"><span>{projects ? "PORTFOLIO VIEW" : "OPERATIONS VIEW"}</span><h1>{projects ? t("projectPortfolio") : t("criticalWork")}</h1><p>{projects ? "Every DTU project in one live delivery view." : "Every open issue and task ordered by urgency."}</p></div>
      <div className="wallboard-command-summary"><small>{projects ? "Tracked projects" : "Queued work"}</small><strong>{projects ? data.projects.length : data.tickets.length}</strong><span>{projects ? "across the portfolio" : "items requiring action"}</span></div>
      <button className="wallboard-back-button" onClick={onBack}><span>←</span><div><small>Return to</small><strong>Overview</strong></div></button>
    </section>

    <section className="wall-panel wallboard-full-panel">
      <div className="wallboard-full-heading">
        <div><small>{projects ? "COMPLETE PORTFOLIO" : "COMPLETE PRIORITY QUEUE"}</small><h2>{projects ? t("projectPortfolio") : t("criticalWork")}</h2></div>
        <b>{projects
          ? `${data.projects.length} ${data.projects.length === 1 ? "project" : "projects"}`
          : `${data.tickets.length} ${data.tickets.length === 1 ? "work item" : "work items"}`}</b>
      </div>
      {projects
        ? data.projects.length
          ? <div className="wallboard-all-projects">{data.projects.map((project: any) => <WallProject key={project.id} project={project} expanded />)}</div>
          : <WallClearState label="Portfolio clear" body="No projects require display." />
        : data.tickets.length
          ? <div className="wallboard-all-tickets">{data.tickets.map((item: any, index: number) => <WallTicket key={item.id} item={item} index={index} isNew={newTicketIds.has(Number(item.id))} />)}</div>
          : <WallClearState label="Priority queue clear" body="No open work is competing for attention." />}
    </section>
  </main>;
}

function WallHeading({ index, eyebrow, title, count, actionLabel, onClick }: {
  index: string;
  eyebrow: string;
  title: string;
  count: string;
  actionLabel: string;
  onClick: () => void;
}) {
  return <button type="button" className="wall-heading wall-heading-action" onClick={onClick}>
    <span>{index}</span><div><small>{eyebrow}</small><h2>{title}</h2></div><b>{count}<em>{actionLabel}</em></b>
  </button>;
}

function WallProject({ project, expanded = false, showcase = false }: { project: any; expanded?: boolean; showcase?: boolean }) {
  const displayedProgress = completeLikeProjectStatuses.has(project.status) ? 100 : project.progress;
  const statusClass = `wall-project-status-${String(project.status).replaceAll("_", "-")}`;
  const projectClass = `${statusClass}${project.status === "complete_monitoring" ? " wall-project-monitoring" : ""}${project.status === "completed" ? " wall-project-completed" : ""}${expanded ? " wall-project-expanded" : ""}${showcase ? " wall-project-showcase" : ""}`;
  if (showcase) return <article className={projectClass}>
    <div className={`wall-project-visual${project.latest_image_id ? " has-image" : ""}`}>
      {project.latest_image_id
        ? <img src={`/api/wallboard/progress-images/${project.latest_image_id}`} alt={`Latest progress for ${project.name}`} />
        : <div className="wall-project-visual-fallback"><ProjectIcon /><i style={{ "--project-progress": `${displayedProgress * 3.6}deg` } as CSSProperties} /><small>{displayedProgress}%</small></div>}
      <span>Latest progress</span>
    </div>
    <div className="wall-project-showcase-copy">
      <header><span className="mono">{project.project_no}</span><Badge value={project.status} /></header>
      <h3>{project.name}</h3>
      {project.current_update && <p>{project.current_update}</p>}
      <div className="wall-progress"><i style={{ width: `${displayedProgress}%` }} /></div>
      <footer><span>{project.owner_name || "Unassigned"}</span><strong>{displayedProgress}%</strong><span>{formatDate(project.due_date)}</span></footer>
    </div>
  </article>;
  return <article className={projectClass}>
    <div><span className="mono">{project.project_no}</span><Badge value={project.status} /></div>
    <h3>{project.name}</h3>
    {project.current_update && <p>{project.current_update}</p>}
    <div className="wall-progress"><i style={{ width: `${displayedProgress}%` }} /></div>
    <footer><span>{project.owner_name || "Unassigned"}</span><strong>{displayedProgress}%</strong><span>{formatDate(project.due_date)}</span></footer>
  </article>;
}

function WallTicket({ item, index, isNew }: { item: any; index: number; isNew: boolean }) {
  return <article className={isNew ? "wall-ticket-new" : ""}>
    <div className="wall-rank">{String(index + 1).padStart(2, "0")}</div>
    <div className="wall-ticket-copy"><div><span className="mono">{item.ticket_no}</span><Badge value={item.priority} kind="priority" /></div><h3>{item.title}</h3><p>{item.project_name || "General DTU work"}</p></div>
    <div className="wall-ticket-meta"><Badge value={item.status} /><strong>{item.assignee_name || "Unassigned"}</strong><span>{formatDate(item.due_date)}</span></div>
  </article>;
}

function WallClearState({ label, body }: { label: string; body: string }) {
  return <div className="wall-clear-state">
    <div className="wall-clear-radar"><i /><i /><i /><b>✓</b></div>
    <div><strong>{label}</strong><span>{body}</span></div>
  </div>;
}
