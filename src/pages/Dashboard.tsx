import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDate } from "../api";
import { useAuth } from "../auth";
import { AlertIcon, CheckIcon, ClockIcon, ProjectIcon } from "../components/Icons";
import { Badge, Empty, Loading, StatCard } from "../components/UI";
import { useI18n } from "../i18n";

export function DashboardPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  useEffect(() => { void api("/api/staff/dashboard").then(setData); }, []);
  if (!data) return <Loading />;
  const today = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const firstName = user?.name.split(" ")[0] ?? "there";

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="hero-grid-lines" />
        <div className="dashboard-hero-copy">
          <div className="hero-kicker"><span className="live-beacon" />Digital Transformation Unit · {today}</div>
          <h1>{t("welcome")}, <em>{firstName}.</em></h1>
          <p>Your operational picture is live. Priorities, delivery pressure, and team capacity are all in one view.</p>
          <div className="hero-actions">
            <Link to="/tickets" className="button button-hero">Open work queue <span>→</span></Link>
            <Link to="/wallboard" target="_blank" className="hero-text-link">Launch wallboard ↗</Link>
          </div>
          <div className="hero-facts">
            <div><small>Assigned to you</small><strong>{data.myWork.length}</strong></div>
            <div><small>Next deadlines</small><strong>{data.upcoming.length}</strong></div>
            <div><small>Team members</small><strong>{data.workload.length}</strong></div>
          </div>
        </div>
        <aside className="operations-pulse">
          <header><div><span>Operational pulse</span><small>Live portfolio signal</small></div><b><i /> Online</b></header>
          <div className="pulse-visual">
            <div className="pulse-ring pulse-ring-one" />
            <div className="pulse-ring pulse-ring-two" />
            <div className="pulse-ring pulse-ring-three" />
            <div className="pulse-core"><span>Open work</span><strong>{data.stats.openIssues}</strong><small>issues in motion</small></div>
            <div className="pulse-satellite satellite-one" />
            <div className="pulse-satellite satellite-two" />
          </div>
          <div className="pulse-readings">
            <div><span>Delivery</span><strong>{data.stats.activeProjects}</strong><i className="reading-blue" /></div>
            <div><span>Attention</span><strong>{data.stats.overdue}</strong><i className="reading-red" /></div>
            <div><span>Intake</span><strong>{data.stats.untriaged}</strong><i className="reading-green" /></div>
          </div>
        </aside>
      </section>
      <section className="stat-grid dashboard-stat-grid">
        <StatCard label={t("activeProjects")} value={data.stats.activeProjects} tone="blue" note="Portfolio in motion" index={0} icon={<ProjectIcon />} />
        <StatCard label={t("openIssues")} value={data.stats.openIssues} tone="amber" note="Needs resolution" index={1} icon={<AlertIcon />} />
        <StatCard label={t("overdue")} value={data.stats.overdue} tone="red" note="Requires attention" index={2} icon={<ClockIcon />} />
        <StatCard label={t("awaitingTriage")} value={data.stats.untriaged} tone="green" note="New intake" index={3} icon={<CheckIcon />} />
      </section>
      <div className="dashboard-grid">
        <section className="panel panel-span-2">
          <div className="panel-heading"><div><span className="eyebrow">Personal queue</span><h2>{t("myWork")}</h2></div><Link to="/tickets" className="text-link">View all →</Link></div>
          {data.myWork.length ? <div className="work-list">{data.myWork.map((item: any) => <WorkRow key={item.id} item={item} />)}</div> : <Empty body="Assigned work will appear here." />}
        </section>
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">Capacity</span><h2>{t("workload")}</h2></div></div>
          <div className="workload-list">
            {data.workload.map((item: any) => {
              const max = Math.max(...data.workload.map((w: any) => w.count), 1);
              return <div key={item.id} className="workload-row"><div><span>{item.name}</span><strong>{item.count}</strong></div><div className="bar"><i style={{ width: `${Math.max(5, item.count / max * 100)}%` }} /></div></div>;
            })}
          </div>
        </section>
        <section className="panel panel-span-2">
          <div className="panel-heading"><div><span className="eyebrow">Schedule</span><h2>{t("upcoming")}</h2></div></div>
          {data.upcoming.length ? <div className="compact-table">
            {data.upcoming.map((item: any) => <Link to={`/tickets/${item.id}`} key={item.id} className="compact-row">
              <div><strong>{item.ticket_no}</strong><span>{item.title}</span></div>
              <span className="muted">{item.project_name || "General"}</span><Badge value={item.priority} kind="priority" /><span className={item.due_date && new Date(item.due_date) < new Date() ? "date-overdue" : ""}>{formatDate(item.due_date)}</span>
            </Link>)}
          </div> : <Empty />}
        </section>
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">Trace</span><h2>{t("recentActivity")}</h2></div></div>
          <div className="timeline">{data.activity.map((event: any) => <div className="timeline-item" key={event.id}><i /><div><strong>{event.actor_name}</strong><span>{event.action.replaceAll("_", " ")}</span><small>{formatDate(event.created_at, true)}</small></div></div>)}</div>
        </section>
      </div>
    </div>
  );
}

function WorkRow({ item }: { item: any }) {
  return <Link to={`/tickets/${item.id}`} className="work-row">
    <div className={`priority-stripe priority-${item.priority}`} />
    <div className="work-main"><div><strong>{item.ticket_no}</strong><Badge value={item.type} kind="type" /></div><h3>{item.title}</h3><span>{item.project_name || "General DTU work"}</span></div>
    <div className="work-meta"><Badge value={item.status} /><span>{formatDate(item.due_date)}</span></div>
  </Link>;
}
