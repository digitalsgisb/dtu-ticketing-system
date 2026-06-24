import { useEffect, useRef, useState } from "react";
import { api, formatDate } from "../api";
import { AlertIcon, CheckIcon, ClockIcon, ProjectIcon } from "../components/Icons";
import { Badge, Loading, StatCard } from "../components/UI";
import { useI18n } from "../i18n";
import { CompanyLogo } from "../components/CompanyLogo";

export function WallboardPage() {
  const { t, lang, setLang } = useI18n();
  const [data, setData] = useState<any>(null);
  const [now, setNow] = useState(new Date());
  const [newTicketIds, setNewTicketIds] = useState<Set<number>>(() => new Set());
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

  return <div className="wallboard">
    <div className="wallboard-atmosphere"><i /><i /><i /></div>
    <header className="wallboard-header">
      <div className="brand company-brand wallboard-brand"><CompanyLogo /><small>DTU Control Centre · {t("controlCentre")}</small></div>
      <div className="wallboard-clock"><strong>{time}</strong><span>{date}</span><small>{t("lastUpdated")}: {new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(data.generatedAt))}</small></div>
      <button className="language-button" onClick={() => setLang(lang === "en" ? "ms" : "en")}>{t("language")}</button>
    </header>

    <section className="wallboard-command">
      <div className="wallboard-command-copy"><span>Operations overview</span><h1>Digital Transformation Unit Task Board</h1><p>Live delivery, service demand, and priority work across the unit.</p></div>
      <div className="wallboard-command-summary"><small>Live workload</small><strong>{totalLive}</strong><span>items in motion</span></div>
      <div className="wallboard-command-readout">
        <span>Next refresh</span>
        <div className="refresh-track" key={data.generatedAt}><i /></div>
        <small>Automatic · 30 seconds</small>
      </div>
    </section>

    <section className="stat-grid wallboard-stats">
      <StatCard label={t("activeProjects")} value={data.stats.activeProjects} tone="blue" note="Delivery portfolio" index={0} icon={<ProjectIcon />} />
      <StatCard label={t("openIssues")} value={data.stats.openIssues} tone="amber" note="Service demand" index={1} icon={<AlertIcon />} />
      <StatCard label={t("overdue")} value={data.stats.overdue} tone="red" note="Needs attention" index={2} icon={<ClockIcon />} />
      <StatCard label="Completed this month" value={data.stats.completedMonth} tone="green" note="Monthly output" index={3} icon={<CheckIcon />} />
    </section>

    <div className="wallboard-ticker"><div><span>LIVE</span><b>{data.stats.activeProjects} active projects</b><i /><b>{data.stats.openIssues} open issues</b><i /><b>{data.stats.overdue} overdue items</b><i /><b>{data.stats.completedMonth} completed this month</b><i /><b>DTU operations online</b></div></div>

    <div className="wallboard-grid">
      <section className="wall-panel">
        <div className="wall-heading"><span>01</span><div><small>PORTFOLIO</small><h2>{t("projectPortfolio")}</h2></div><b>{data.projects.length} tracked</b></div>
        {data.projects.length ? <div className="wall-projects">{data.projects.map((project: any) => {
          const displayedProgress = project.status === "completed" ? 100 : project.progress;
          return <article key={project.id} className={project.status === "completed" ? "wall-project-completed" : ""}>
            <div><span className="mono">{project.project_no}</span><Badge value={project.status} /></div>
            <h3>{project.name}</h3>
            <div className="wall-progress"><i style={{ width: `${displayedProgress}%` }} /></div>
            <footer><span>{project.owner_name || "Unassigned"}</span><strong>{displayedProgress}%</strong><span>{formatDate(project.due_date)}</span></footer>
          </article>;
        })}</div> : <WallClearState label="Portfolio clear" body="No active or completed projects require display." />}
      </section>

      <section className="wall-panel">
        <div className="wall-heading"><span>02</span><div><small>OPERATIONS</small><h2>{t("criticalWork")}</h2></div><b>{data.tickets.length} queued</b></div>
        {data.tickets.length ? <div className="wall-tickets">{data.tickets.map((item: any, index: number) => <article key={item.id} className={newTicketIds.has(Number(item.id)) ? "wall-ticket-new" : ""}>
          <div className="wall-rank">{String(index + 1).padStart(2, "0")}</div>
          <div><div><span className="mono">{item.ticket_no}</span><Badge value={item.priority} kind="priority" /></div><h3>{item.title}</h3><p>{item.project_name || "General DTU work"}</p></div>
          <div className="wall-ticket-meta"><Badge value={item.status} /><strong>{item.assignee_name || "Unassigned"}</strong><span>{formatDate(item.due_date)}</span></div>
        </article>)}</div> : <WallClearState label="Priority queue clear" body="No open work is competing for attention." />}
      </section>
    </div>

    <footer className="wallboard-footer"><span className="status-dot" /> Systems operational <span>•</span> {t("refreshes")} <span>•</span> Secure local display</footer>
    <div className="wallboard-watermark">© DIGITAL TRANSFORMATION UNIT</div>
  </div>;
}

function WallClearState({ label, body }: { label: string; body: string }) {
  return <div className="wall-clear-state">
    <div className="wall-clear-radar"><i /><i /><i /><b>✓</b></div>
    <div><strong>{label}</strong><span>{body}</span></div>
  </div>;
}
