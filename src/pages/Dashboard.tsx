import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDate } from "../api";
import { useAuth } from "../auth";
import { AlertIcon, CheckIcon, ClockIcon, ProjectIcon } from "../components/Icons";
import { Badge, Empty, Loading, StatCard } from "../components/UI";
import { useI18n } from "../i18n";
import { useLiveRefresh } from "../live";

export function DashboardPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  const load = () => api("/api/staff/dashboard").then(setData);
  useEffect(() => { void load(); }, []);
  useLiveRefresh(load);
  if (!data) return <Loading />;
  const today = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const firstName = user?.name.split(" ")[0] ?? "there";
  const role = user?.role ?? "member";
  const roleContent = {
    admin: {
      kicker: "Administrator overview",
      intro: "Your operational picture is live. Monitor delivery, demand, team capacity, and system governance from one place.",
      primary: { to: "/admin", label: "Manage control centre" },
      secondary: { to: "/wallboard", label: "Launch wallboard ↗", external: true }
    },
    lead: {
      kicker: "Delivery lead overview",
      intro: "Keep delivery moving with team priorities, portfolio pressure, new demand, and management-ready progress in one view.",
      primary: { to: "/briefing", label: "Open progress briefing" },
      secondary: { to: "/requests", label: "Review project requests", external: false }
    },
    member: {
      kicker: "My workday",
      intro: "Focus on what needs your attention today: assigned work, approaching deadlines, and the projects you own.",
      primary: { to: "/tickets", label: "Open my work queue" },
      secondary: { to: "/my-projects", label: "View my projects", external: false }
    }
  }[role];
  const upcoming = role === "member" ? data.myUpcoming : data.upcoming;

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="hero-grid-lines" />
        <div className="dashboard-hero-copy">
          <div className="hero-kicker"><span className="live-beacon" />{roleContent.kicker} · {today}</div>
          <h1>{t("welcome")}, <em>{firstName}.</em></h1>
          <p>{roleContent.intro}</p>
          <div className="hero-actions">
            <Link to={roleContent.primary.to} className="button button-hero">{roleContent.primary.label} <span>→</span></Link>
            <Link to={roleContent.secondary.to} target={roleContent.secondary.external ? "_blank" : undefined} className="hero-text-link">{roleContent.secondary.label}</Link>
          </div>
          <div className="hero-facts">
            <div><small>Assigned to you</small><strong>{data.stats.personalOpen}</strong></div>
            <div><small>Your deadlines</small><strong>{data.myUpcoming.length}</strong></div>
            <div><small>{role === "member" ? "Projects you own" : "Team members"}</small><strong>{role === "member" ? data.stats.ownedProjects : data.workload.length}</strong></div>
          </div>
        </div>
        <aside className="operations-pulse">
          <header><div><span>{role === "member" ? "Personal pulse" : "Operational pulse"}</span><small>{role === "member" ? "Your live workload" : "Live portfolio signal"}</small></div><b><i /> Online</b></header>
          <div className="pulse-visual">
            <div className="pulse-ring pulse-ring-one" />
            <div className="pulse-ring pulse-ring-two" />
            <div className="pulse-ring pulse-ring-three" />
            <div className="pulse-core"><span>{role === "member" ? "My open work" : "Open work"}</span><strong>{role === "member" ? data.stats.personalOpen : data.stats.openIssues}</strong><small>{role === "member" ? "items assigned" : "issues in motion"}</small></div>
            <div className="pulse-satellite satellite-one" />
            <div className="pulse-satellite satellite-two" />
          </div>
          <div className="pulse-readings">
            <div><span>{role === "member" ? "Projects" : "Delivery"}</span><strong>{role === "member" ? data.stats.ownedProjects : data.stats.activeProjects}</strong><i className="reading-blue" /></div>
            <div><span>Attention</span><strong>{role === "member" ? data.stats.personalOverdue : data.stats.overdue}</strong><i className="reading-red" /></div>
            <div><span>{role === "member" ? "Alerts" : "Intake"}</span><strong>{role === "member" ? data.stats.unreadNotifications : data.stats.untriaged}</strong><i className="reading-green" /></div>
          </div>
        </aside>
      </section>
      <section className="stat-grid dashboard-stat-grid">
        {role === "member" ? <>
          <StatCard label="My open work" value={data.stats.personalOpen} tone="blue" note="Assigned to you" index={0} icon={<CheckIcon />} />
          <StatCard label="My overdue work" value={data.stats.personalOverdue} tone="red" note="Needs attention" index={1} icon={<ClockIcon />} />
          <StatCard label="My active projects" value={data.stats.ownedProjects} tone="green" note="Owned by you" index={2} icon={<ProjectIcon />} />
          <StatCard label="Unread alerts" value={data.stats.unreadNotifications} tone="amber" note="Recent updates" index={3} icon={<AlertIcon />} />
        </> : <>
          <StatCard label={t("activeProjects")} value={data.stats.activeProjects} tone="blue" note="Portfolio in motion" index={0} icon={<ProjectIcon />} />
          <StatCard label={t("openIssues")} value={data.stats.openIssues} tone="amber" note="Needs resolution" index={1} icon={<AlertIcon />} />
          <StatCard label={t("overdue")} value={data.stats.overdue} tone="red" note="Requires attention" index={2} icon={<ClockIcon />} />
          <StatCard label={t("awaitingTriage")} value={data.stats.untriaged} tone="green" note="New intake" index={3} icon={<CheckIcon />} />
        </>}
      </section>
      <div className="dashboard-grid">
        <section className="panel panel-span-2">
          <div className="panel-heading"><div><span className="eyebrow">Personal queue</span><h2>{t("myWork")}</h2></div><Link to="/tickets" className="text-link">View all →</Link></div>
          {data.myWork.length ? <div className="work-list">{data.myWork.map((item: any) => <WorkRow key={item.id} item={item} />)}</div> : <Empty body="Assigned work will appear here." />}
        </section>
        {role !== "member" && <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">Capacity</span><h2>{t("workload")}</h2></div></div>
          <div className="workload-list">
            {data.workload.map((item: any) => {
              const max = Math.max(...data.workload.map((w: any) => w.count), 1);
              return <div key={item.id} className="workload-row"><div><span>{item.name}</span><strong>{item.count}</strong></div><div className="bar"><i style={{ width: `${Math.max(5, item.count / max * 100)}%` }} /></div></div>;
            })}
          </div>
        </section>}
        <section className="panel panel-span-2">
          <div className="panel-heading"><div><span className="eyebrow">Schedule</span><h2>{t("upcoming")}</h2></div></div>
          {upcoming.length ? <div className="compact-table">
            {upcoming.map((item: any) => <Link to={`/tickets/${item.id}`} key={item.id} className="compact-row">
              <div><strong>{item.ticket_no}</strong><span>{item.title}</span></div>
              <span className="muted">{item.project_name || "General"}</span><Badge value={item.priority} kind="priority" /><span className={item.due_date && new Date(item.due_date) < new Date() ? "date-overdue" : ""}>{formatDate(item.due_date)}</span>
            </Link>)}
          </div> : <Empty />}
        </section>
        {role !== "member" && <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">Trace</span><h2>{t("recentActivity")}</h2></div></div>
          <div className="timeline">{data.activity.map((event: any) => <div className="timeline-item" key={event.id}><i /><div><strong>{event.actor_name}</strong><span>{event.action.replaceAll("_", " ")}</span><small>{formatDate(event.created_at, true)}</small></div></div>)}</div>
        </section>}
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
