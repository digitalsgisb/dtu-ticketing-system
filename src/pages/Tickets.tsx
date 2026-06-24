import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { PlusIcon, SearchIcon } from "../components/Icons";
import { Badge, Empty, ErrorNotice, Loading, Modal, PageHeader } from "../components/UI";
import { useI18n } from "../i18n";

export function TicketsPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [tickets, setTickets] = useState<any[] | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const load = () => {
    const projectId = params.get("projectId");
    return api<any[]>(`/api/staff/tickets${projectId ? `?projectId=${projectId}` : ""}`).then(setTickets);
  };
  useEffect(() => { void load(); void api<any[]>("/api/staff/projects").then(setProjects); void api<any[]>("/api/staff/users").then(setUsers); }, [params]);
  const filtered = useMemo(() => (tickets ?? []).filter(item =>
    (!status || item.status === status) && `${item.ticket_no} ${item.title} ${item.project_name || ""}`.toLowerCase().includes(search.toLowerCase())
  ), [tickets, search, status]);
  if (!tickets) return <Loading />;

  return <>
    <PageHeader eyebrow="Operations queue" title={t("tickets")} description="Triage, assign, and resolve every piece of delivery and support work." actions={<button className="button button-primary" onClick={() => setShowCreate(true)}><PlusIcon />{t("newTicket")}</button>} />
    <div className="toolbar">
      <div className="search-box"><SearchIcon /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={`${t("search")} work…`} /></div>
      <div className="result-count">{filtered.length} items</div>
    </div>
    <div className="status-filter-bar" aria-label="Filter by status">
      {[["", t("all")], ["new", "New"], ["triaged", "Triaged"], ["assigned", "Assigned"], ["in_progress", "In progress"], ["waiting", "Waiting"], ["resolved", "Resolved"], ["closed", "Closed"]].map(([value, label]) =>
        <button type="button" key={value || "all"} className={status === value ? "active" : ""} onClick={() => setStatus(value)}><i />{label}</button>
      )}
    </div>
    {filtered.length ? <section className="panel panel-flush"><div className="data-table tickets-table">
      <div className="table-head"><span>Reference</span><span>Work item</span><span>Project</span><span>{t("assignee")}</span><span>{t("dueDate")}</span><span>{t("status")}</span></div>
      {filtered.map(item => <Link to={`/tickets/${item.id}`} className="table-row" key={item.id}>
        <span><strong className="mono">{item.ticket_no}</strong><small><Badge value={item.priority} kind="priority" /></small></span>
        <span><strong>{item.title}</strong><small><Badge value={item.type} kind="type" /></small></span>
        <span>{item.project_name || "General"}</span><span>{item.assignee_name || "Unassigned"}</span>
        <span className={item.due_date && new Date(`${item.due_date}T23:59:00`) < new Date() && !["resolved","closed"].includes(item.status) ? "date-overdue" : ""}>{formatDate(item.due_date)}</span>
        <span><Badge value={item.status} /></span>
      </Link>)}
    </div></section> : <Empty title="No matching work items" />}
    {showCreate && <CreateTicket projects={projects} users={users} defaultProject={params.get("projectId") || ""} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load(); }} />}
  </>;
}

function CreateTicket({ projects, users, defaultProject, onClose, onCreated }: { projects: any[]; users: any[]; defaultProject: string; onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ projectId: defaultProject, type: "task", title: "", description: "", priority: "medium", status: "new", assigneeId: "", dueDate: "" });
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/staff/tickets", json("POST", { ...form, projectId: form.projectId ? Number(form.projectId) : null, assigneeId: form.assigneeId ? Number(form.assigneeId) : null, dueDate: form.dueDate || null }));
      onCreated();
    } catch (err) { setError((err as Error).message); }
  };
  return <Modal title={t("newTicket")} onClose={onClose} wide><form className="form-stack" onSubmit={submit}><ErrorNotice message={error} />
    <div className="form-grid">
      <label>{t("type")}<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="task">Task</option><option value="issue">Issue</option></select></label>
      <label>Project<select value={form.projectId} onChange={e => setForm({ ...form, projectId: e.target.value })}><option value="">General DTU work</option>{projects.map(p => <option value={p.id} key={p.id}>{p.project_no} · {p.name}</option>)}</select></label>
    </div>
    <label>{t("title")}<input required minLength={3} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
    <label>{t("description")}<textarea rows={5} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
    <div className="form-grid">
      <label>{t("priority")}<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label>
      <label>{t("status")}<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option>new</option><option>triaged</option><option>assigned</option><option value="in_progress">in progress</option><option>waiting</option></select></label>
      <label>{t("assignee")}<select value={form.assigneeId} onChange={e => setForm({ ...form, assigneeId: e.target.value })}><option value="">Unassigned</option>{users.filter(u => u.active).map(u => <option value={u.id} key={u.id}>{u.name}</option>)}</select></label>
      <label>{t("dueDate")}<input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></label>
    </div>
    <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>{t("cancel")}</button><button className="button button-primary">{t("create")}</button></div>
  </form></Modal>;
}
