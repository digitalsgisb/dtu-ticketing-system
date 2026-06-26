import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { PlusIcon, SearchIcon } from "../components/Icons";
import { Badge, Empty, ErrorNotice, Loading, Modal, PageHeader } from "../components/UI";
import { useI18n } from "../i18n";

const completeLikeProjectStatuses = new Set(["complete_monitoring", "completed"]);

export function ProjectsPage() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<any[] | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const load = () => api<any[]>("/api/staff/projects").then(setProjects);
  useEffect(() => { void load(); void api<any[]>("/api/staff/users").then(setUsers); }, []);
  const filtered = useMemo(() => (projects ?? []).filter(p => `${p.name} ${p.project_no} ${p.department_name}`.toLowerCase().includes(search.toLowerCase())), [projects, search]);
  if (!projects) return <Loading />;

  return (
    <>
      <PageHeader eyebrow="Portfolio" title={t("projects")} description="Plan, deliver, and support every DTU digitalization project." actions={<button className="button button-primary" onClick={() => setShowCreate(true)}><PlusIcon />{t("newProject")}</button>} />
      <div className="toolbar">
        <div className="search-box"><SearchIcon /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={`${t("search")} projects…`} /></div>
        <div className="result-count">{filtered.length} projects</div>
      </div>
      {filtered.length ? <div className="project-grid">{filtered.map(project => {
        const displayedProgress = completeLikeProjectStatuses.has(project.status) ? 100 : project.progress;
        return <Link to={`/projects/${project.id}`} className="project-card" key={project.id}>
          <div className="project-card-top"><span className="mono">{project.project_no}</span><Badge value={project.status} /></div>
          <div><h2>{project.name}</h2><p>{project.description || "No project description yet."}</p></div>
          <div className="project-progress"><div><span>{t("progress")}</span><strong>{displayedProgress}%</strong></div><div className="bar"><i style={{ width: `${displayedProgress}%` }} /></div></div>
          <div className="project-card-meta"><span><small>{t("department")}</small>{project.department_name}</span><span><small>{t("dueDate")}</small>{formatDate(project.due_date)}</span><span><small>Open work</small>{project.open_count || 0}</span></div>
        </Link>;
      })}</div> : <Empty title="No matching projects" />}
      {showCreate && <ProjectCreateModal users={users} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load(); }} />}
    </>
  );
}

function ProjectCreateModal({ users, onClose, onCreated }: { users: any[]; onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: "", description: "", departmentName: "", ownerId: "", priority: "medium", dueDate: "" });
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    try {
      await api("/api/staff/projects", json("POST", { ...form, ownerId: form.ownerId ? Number(form.ownerId) : null, dueDate: form.dueDate || null }));
      onCreated();
    } catch (err) { setError((err as Error).message); }
  };
  return <Modal title={t("newProject")} onClose={onClose}>
    <form className="form-stack" onSubmit={submit}>
      <ErrorNotice message={error} />
      <label>{t("title")}<input required minLength={3} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label>{t("description")}<textarea rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      <div className="form-grid">
        <label>{t("department")}<input required value={form.departmentName} onChange={e => setForm({ ...form, departmentName: e.target.value })} /></label>
        <label>{t("owner")}<select value={form.ownerId} onChange={e => setForm({ ...form, ownerId: e.target.value })}><option value="">Unassigned</option>{users.filter(u => u.active).map(u => <option value={u.id} key={u.id}>{u.name}</option>)}</select></label>
        <label>{t("priority")}<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label>
        <label>{t("dueDate")}<input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></label>
      </div>
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>{t("cancel")}</button><button className="button button-primary">{t("create")}</button></div>
    </form>
  </Modal>;
}
