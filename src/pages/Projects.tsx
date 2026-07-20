import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { useAuth } from "../auth";
import { PlusIcon, SearchIcon } from "../components/Icons";
import { Badge, Empty, ErrorNotice, Loading, Modal, PageHeader } from "../components/UI";
import { useI18n } from "../i18n";

const completeLikeProjectStatuses = new Set(["complete_monitoring", "completed"]);
const projectStatusFilters = [["all", "All"], ["in_progress", "In progress"], ["complete_monitoring", "Monitoring"], ["on_hold", "On hold"], ["planned", "Planned"], ["completed", "Completed"], ["cancelled", "Cancelled"]] as const;

export function ProjectsPage({ myProjectsOnly = false }: { myProjectsOnly?: boolean }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[] | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [scope, setScope] = useState(myProjectsOnly ? "mine" : "all");
  const [progressFilter, setProgressFilter] = useState("all");
  const [deadlineFilter, setDeadlineFilter] = useState("all");
  const [sort, setSort] = useState("updated_desc");
  const [showCreate, setShowCreate] = useState(false);
  const load = () => api<any[]>("/api/staff/projects").then(setProjects);

  useEffect(() => { void load(); void api<any[]>("/api/staff/users").then(setUsers); }, []);

  const effectiveScope = myProjectsOnly ? "mine" : scope;
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...(projects ?? [])].filter(project => {
      const progress = projectProgress(project);
      const dueDays = daysUntil(project.due_date);
      const matchesStatus = filter === "all" || project.status === filter;
      const matchesScope = effectiveScope === "all" || isOwnedBy(project, user);
      const matchesProgress = progressFilter === "all"
        || (progressFilter === "early" && progress < 35)
        || (progressFilter === "mid" && progress >= 35 && progress < 75)
        || (progressFilter === "late" && progress >= 75 && progress < 100)
        || (progressFilter === "done" && progress === 100);
      const matchesDeadline = deadlineFilter === "all"
        || (deadlineFilter === "overdue" && dueDays !== null && dueDays < 0)
        || (deadlineFilter === "next14" && dueDays !== null && dueDays >= 0 && dueDays <= 14)
        || (deadlineFilter === "next30" && dueDays !== null && dueDays >= 0 && dueDays <= 30)
        || (deadlineFilter === "none" && dueDays === null);
      const haystack = `${project.name} ${project.project_no} ${project.department_name} ${project.owner_name ?? ""} ${project.current_update ?? ""}`.toLowerCase();
      return matchesStatus && matchesScope && matchesProgress && matchesDeadline && haystack.includes(query);
    }).sort((left, right) => compareProjects(left, right, sort));
  }, [projects, search, filter, effectiveScope, user, progressFilter, deadlineFilter, sort]);

  if (!projects) return <Loading />;

  const canCreateProject = user?.role === "admin" || user?.role === "lead";
  const title = myProjectsOnly ? "My Projects" : t("projects");
  const description = myProjectsOnly
    ? `Projects owned by ${user?.name ?? "you"}. Open a project to update progress and attach progress photos.`
    : "Plan, deliver, and support every DTU digitalization project.";

  return (
    <>
      <PageHeader
        eyebrow={myProjectsOnly ? "Owned portfolio" : "Portfolio"}
        title={title}
        description={description}
        actions={canCreateProject && !myProjectsOnly ? <button className="button button-primary" onClick={() => setShowCreate(true)}><PlusIcon />{t("newProject")}</button> : undefined}
      />
      <div className="project-toolbar">
        <div className="project-filter-tabs">
          {projectStatusFilters.map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        <div className="search-box"><SearchIcon /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={`${t("search")} projects...`} /></div>
        <div className="project-advanced-filters">
          {!myProjectsOnly && <label>Scope<select value={scope} onChange={event => setScope(event.target.value)}>
            <option value="all">All projects</option><option value="mine">My projects</option>
          </select></label>}
          <label>Progress<select value={progressFilter} onChange={event => setProgressFilter(event.target.value)}>
            <option value="all">Any progress</option><option value="early">0-34%</option><option value="mid">35-74%</option><option value="late">75-99%</option><option value="done">100%</option>
          </select></label>
          <label>Deadline<select value={deadlineFilter} onChange={event => setDeadlineFilter(event.target.value)}>
            <option value="all">Any deadline</option><option value="overdue">Overdue</option><option value="next14">Next 14 days</option><option value="next30">Next 30 days</option><option value="none">No deadline</option>
          </select></label>
          <label>Sort by<select value={sort} onChange={event => setSort(event.target.value)}>
            <option value="updated_desc">Latest update</option><option value="project_no_asc">Project ID ascending</option><option value="project_no_desc">Project ID descending</option><option value="created_desc">Newest project</option><option value="deadline_asc">Nearest deadline</option><option value="progress_desc">Highest progress</option><option value="progress_asc">Lowest progress</option><option value="priority">Priority first</option>
          </select></label>
        </div>
        <div className="project-result-summary"><strong>{filtered.length}</strong> of {projects.length} projects shown</div>
      </div>
      {filtered.length ? <div className="project-grid">{filtered.map(project => {
        const displayedProgress = projectProgress(project);
        return <Link to={`/projects/${project.id}`} className="project-card" key={project.id}>
          <div className="project-card-image">{project.latest_image_id ? <img src={`/api/staff/projects/progress-images/${project.latest_image_id}`} alt={`Latest progress for ${project.name}`} /> : <div><span>{project.project_no}</span><small>Add a photo with a progress update</small></div>}</div>
          <div className="project-card-content">
            <div className="project-card-top"><span className="mono">{project.project_no}</span><Badge value={project.status} /></div>
            <div><h2>{project.name}</h2><p>{project.description || "No project description yet."}</p></div>
            <div className="project-progress"><div><span>{t("progress")}</span><strong>{displayedProgress}%</strong></div><div className="bar"><i style={{ width: `${displayedProgress}%` }} /></div></div>
            <div className="project-card-meta"><span><small>{t("department")}</small>{project.department_name}</span><span><small>{t("dueDate")}</small>{formatDate(project.due_date)}</span><span><small>Open work</small>{project.open_count || 0}</span></div>
          </div>
        </Link>;
      })}</div> : <Empty title={myProjectsOnly ? "No owned projects match this view" : "No matching projects"} />}
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

function isOwnedBy(project: any, user: { id: number; name: string } | null) {
  if (!user) return false;
  return Number(project.owner_id) === user.id || String(project.owner_name ?? "").trim().toLowerCase() === user.name.trim().toLowerCase();
}

function projectProgress(project: any) {
  return completeLikeProjectStatuses.has(project.status) ? 100 : Number(project.progress ?? 0);
}

function parseProjectDate(value?: string | null) {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00`
    : value.includes(" ") && !value.includes("T")
      ? `${value.replace(" ", "T")}Z`
      : value;
  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? null : time;
}

function daysUntil(value?: string | null) {
  const time = parseProjectDate(value);
  if (time === null) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((time - today.getTime()) / 86_400_000);
}

function projectNoValue(value?: string | null) {
  const match = String(value ?? "").match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function compareProjectNo(left: any, right: any) {
  return projectNoValue(left.project_no) - projectNoValue(right.project_no)
    || String(left.project_no ?? "").localeCompare(String(right.project_no ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

function compareProjects(left: any, right: any, sort: string) {
  if (sort === "project_no_asc") return compareProjectNo(left, right);
  if (sort === "project_no_desc") return compareProjectNo(right, left);
  if (sort === "created_desc") return compareDateDesc(left.created_at, right.created_at);
  if (sort === "deadline_asc") return compareDateAsc(left.due_date, right.due_date) || compareProjectNo(left, right);
  if (sort === "progress_desc") return projectProgress(right) - projectProgress(left) || compareProjectNo(left, right);
  if (sort === "progress_asc") return projectProgress(left) - projectProgress(right) || compareProjectNo(left, right);
  if (sort === "priority") return comparePriority(left, right) || compareProjectNo(left, right);
  return compareDateDesc(left.progress_updated_at || left.updated_at || left.created_at, right.progress_updated_at || right.updated_at || right.created_at)
    || compareProjectNo(left, right);
}

function compareDateAsc(left?: string | null, right?: string | null) {
  return (parseProjectDate(left) ?? Number.MAX_SAFE_INTEGER) - (parseProjectDate(right) ?? Number.MAX_SAFE_INTEGER);
}

function compareDateDesc(left?: string | null, right?: string | null) {
  return (parseProjectDate(right) ?? 0) - (parseProjectDate(left) ?? 0);
}

function comparePriority(left: any, right: any) {
  const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return (rank[left.priority] ?? 9) - (rank[right.priority] ?? 9);
}
