import { Link } from "react-router-dom";
import { formatDate } from "../api";
import { Badge, Empty } from "./UI";

type WorkUser = { id: number; role: string } | null;
export function workIsComplete(item: any, userId?: number) {
  return ["resolved", "closed"].includes(item.status) || (userId !== undefined && item.completion_mode !== "group" && Boolean(item.assignees?.find((person: any) => person.id === userId)?.completed_at));
}

export function canCompleteWork(item: any, user: WorkUser) {
  if (!user || ["resolved", "closed"].includes(item.status)) return false;
  if (user.role === "admin") return true;
  const manages = ["admin", "lead"].includes(user.role);
  const mine = item.assignees?.find((person: any) => person.id === user.id);
  return (item.completion_mode === "group" && manages) || (item.assignee_total ? Boolean(mine && (item.completion_mode === "group" || !mine.completed_at)) : manages);
}

export function completionLabel(item: any, user?: WorkUser) {
  if (user?.role === "admin") return "Complete work";
  return item.completion_mode === "group" ? "Complete for the team" : item.assignee_total > 1 ? "Complete my part" : item.type === "issue" ? "Complete issue" : "Complete task";
}

function overdue(item: any) {
  return item.due_date && new Date(`${item.due_date}T23:59:00`) < new Date() && !workIsComplete(item);
}

export function PendingWorkCards({ items, user }: { items: any[]; user: WorkUser }) {
  return <div className="pending-work-grid">{items.map(item => <article className={`pending-work-card priority-${item.priority}`} key={item.id}>
    <div className="pending-work-top"><Link className="mono" to={`/tickets/${item.id}`}>{item.ticket_no}</Link><Badge value={item.priority} kind="priority" /></div>
    <Link className="pending-work-title" to={`/tickets/${item.id}`}><h3>{item.title}</h3></Link>
    <div className="pending-work-badges"><Badge value={item.status} /><Badge value={item.type} kind="type" /></div>
    <dl><div><dt>Project</dt><dd>{item.project_name || "General DTU work"}</dd></div><div><dt>Assignee</dt><dd>{item.assignee_name || "Unassigned"}</dd></div><div><dt>Due date</dt><dd className={overdue(item) ? "date-overdue" : ""}>{item.due_date ? formatDate(item.due_date) : "No due date"}{overdue(item) ? " · Overdue" : ""}</dd></div></dl>
    {item.assignee_total > 0 && <p className="pending-work-progress">{item.completion_mode === "group" ? "One submission completes the team’s work" : `${item.assignee_completed ?? 0} of ${item.assignee_total} people finished`}</p>}
    <div className="pending-work-actions"><Link className="button button-secondary" to={`/tickets/${item.id}`}>View details</Link>{canCompleteWork(item, user) && <Link className="button button-primary" to={`/tickets/${item.id}?complete=1`}>{completionLabel(item, user)}</Link>}</div>
  </article>)}</div>;
}

export function WorkItems({ items, user, personal = false }: { items: any[]; user: WorkUser; personal?: boolean }) {
  const pending = items.filter(item => !workIsComplete(item, personal ? user?.id : undefined));
  const completed = items.filter(item => workIsComplete(item, personal ? user?.id : undefined));
  return <div className="work-sections">
    <section aria-label="Pending work"><div className="work-section-heading"><h2>Pending work</h2><span>{pending.length} items</span></div>{pending.length ? <PendingWorkCards items={pending} user={user} /> : <Empty title="No pending work" />}</section>
    <section aria-label="Completed work"><div className="work-section-heading"><h2>{personal ? "Completed by you" : "Completed work"}</h2><span>{completed.length} items</span></div>{completed.length ? <div className="panel panel-flush"><div className="data-table tickets-table">
      <div className="table-head"><span>Reference</span><span>Work item</span><span>Project</span><span>Assignee</span><span>Due date</span><span>Status</span></div>
      {completed.map(item => <Link className="table-row" to={`/tickets/${item.id}`} key={item.id}>
        <span className="mono">{item.ticket_no}</span><span><strong>{item.title}</strong><small><Badge value={item.type} kind="type" /></small></span><span>{item.project_name || "General"}</span><span>{item.assignee_name || "Unassigned"}</span><span>{formatDate(item.due_date)}</span><span><Badge value={item.status} />{!["resolved", "closed"].includes(item.status) && <small>Your part is complete · Team pending</small>}</span>
      </Link>)}
    </div></div> : <Empty title="No completed work yet" />}</section>
  </div>;
}
