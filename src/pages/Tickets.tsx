import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api, json } from "../api";
import { PlusIcon, SearchIcon } from "../components/Icons";
import { Empty, ErrorNotice, Loading, Modal, PageHeader } from "../components/UI";
import { WorkItems, workIsComplete } from "../components/WorkItems";
import { useI18n } from "../i18n";
import { useLiveRefresh } from "../live";
import { useAuth } from "../auth";
import { AssigneePicker } from "../components/AssigneePicker";

export function TicketsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [tickets, setTickets] = useState<any[] | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState<"open" | "mine" | "all">(params.get("queue") === "mine" || user?.role === "member" ? "mine" : "open");
  const [type, setType] = useState<"" | "task" | "issue">("");
  const [showCreate, setShowCreate] = useState(false);
  const load = () => {
    const projectId = params.get("projectId");
    return api<any[]>(`/api/staff/tickets${projectId ? `?projectId=${projectId}` : ""}`).then(setTickets);
  };
  useEffect(() => { void load(); void api<any[]>("/api/staff/projects").then(setProjects); void api<any[]>("/api/staff/users").then(setUsers); }, [params]);
  useLiveRefresh(load);
  const filtered = useMemo(() => (tickets ?? []).filter(item =>
    (queue !== "open" || !workIsComplete(item)) &&
    (queue !== "mine" || item.assignees?.some((assignee: { id: number }) => assignee.id === user?.id)) &&
    (!type || item.type === type) &&
    `${item.ticket_no} ${item.title} ${item.project_name || ""}`.toLowerCase().includes(search.toLowerCase())
  ), [tickets, search, queue, type, user?.id]);
  if (!tickets) return <Loading />;

  return <>
    <PageHeader eyebrow="Operations queue" title={t("tickets")} description="Triage, assign, and resolve every piece of delivery and support work." actions={<button className="button button-primary" onClick={() => setShowCreate(true)}><PlusIcon />{t("newTicket")}</button>} />
    <div className="toolbar">
      <div className="search-box"><SearchIcon /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={`${t("search")} work…`} /></div>
      <div className="result-count">{filtered.length} items</div>
    </div>
    <div className="status-filter-bar" aria-label="Work queue">
      {([['open', 'Open work'], ['mine', 'Assigned to me'], ['all', 'All work']] as const).map(([value, label]) =>
        <button type="button" key={value} className={queue === value ? "active" : ""} onClick={() => setQueue(value)}><i />{label}</button>
      )}
      <span className="work-filter-divider" />
      {([['', 'Tasks & issues'], ['task', 'Tasks'], ['issue', 'Issues']] as const).map(([value, label]) =>
        <button type="button" key={value || 'both'} className={type === value ? "active" : ""} onClick={() => setType(value)}><i />{label}</button>
      )}
    </div>
    {filtered.length ? <WorkItems items={filtered} user={user} personal={queue === "mine"} /> : <Empty title="No matching work items" />}
    {showCreate && <CreateTicket projects={projects} users={users} defaultProject={params.get("projectId") || ""} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load(); }} />}
  </>;
}

function CreateTicket({ projects, users, defaultProject, onClose, onCreated }: { projects: any[]; users: any[]; defaultProject: string; onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ projectId: defaultProject, type: "task", completionMode: "individual", title: "", description: "", priority: "medium", assigneeIds: [] as number[], dueDate: "" });
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/staff/tickets", json("POST", { ...form, status: form.assigneeIds.length ? "assigned" : "new", projectId: form.projectId ? Number(form.projectId) : null, dueDate: form.dueDate || null }));
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
    <label>Completion method<select value={form.completionMode} onChange={e => setForm({ ...form, completionMode: e.target.value })}><option value="individual">Individual — every assignee completes their part</option><option value="group">Group — one assignee completes for everyone</option></select><small>Choose whether each person submits evidence or the team submits once.</small></label>
    <div className="form-grid">
      <label>{t("priority")}<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label>
      <AssigneePicker users={users} value={form.assigneeIds} onChange={assigneeIds => setForm({ ...form, assigneeIds })} />
      <label>{t("dueDate")}<input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></label>
    </div>
    <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>{t("cancel")}</button><button className="button button-primary">{t("create")}</button></div>
  </form></Modal>;
}
