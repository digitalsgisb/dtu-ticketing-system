import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { ArrowIcon, CheckIcon, ClockIcon, PlusIcon, ProjectIcon } from "../components/Icons";
import { Badge, Empty, ErrorNotice, Loading, Modal, PageHeader, StatCard } from "../components/UI";
import { compressProgressImage } from "../progressImages";

const completeLikeProjectStatuses = new Set(["complete_monitoring", "completed"]);
const projectStatusOptions = [
  ["planned", "Planned"],
  ["in_progress", "In progress"],
  ["on_hold", "On hold"],
  ["complete_monitoring", "Complete and Monitoring"],
  ["completed", "Completed"]
] as const;
const briefingStatusFilters = [["all", "All"], ["in_progress", "In progress"], ["complete_monitoring", "Monitoring"], ["on_hold", "On hold"], ["planned", "Planned"], ["completed", "Completed"]] as const;
const priorityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const briefingPreferenceKey = "dtu-briefing-preferences";
const briefingOrderKey = "dtu-briefing-presentation-order";
const briefingScrollKey = "dtu-briefing-return-scroll";

type PresentationProject = { id: number; project_no: string; name: string };

function savedBriefingPreferences() {
  try { return JSON.parse(sessionStorage.getItem(briefingPreferenceKey) || "{}"); }
  catch { return {}; }
}

function savedPresentationOrder(): PresentationProject[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(briefingOrderKey) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function shortUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}

export function ProgressBriefingPage() {
  const saved = useMemo(savedBriefingPreferences, []);
  const [data, setData] = useState<any>(null);
  const [filter, setFilter] = useState(saved.filter || "all");
  const [progressFilter, setProgressFilter] = useState(saved.progressFilter || "all");
  const [deadlineFilter, setDeadlineFilter] = useState(saved.deadlineFilter || "all");
  const [freshnessFilter, setFreshnessFilter] = useState(saved.freshnessFilter || "all");
  const [sort, setSort] = useState(saved.sort || "updated_desc");
  const [search, setSearch] = useState(saved.search || "");
  const [error, setError] = useState("");
  useEffect(() => {
    document.title = "Progress Briefing · DTU";
    void api("/api/staff/briefing").then(setData).catch(err => setError(err.message));
    return () => { document.title = "DTU Control Centre"; };
  }, []);
  useEffect(() => {
    sessionStorage.setItem(briefingPreferenceKey, JSON.stringify({ filter, progressFilter, deadlineFilter, freshnessFilter, sort, search }));
  }, [filter, progressFilter, deadlineFilter, freshnessFilter, sort, search]);
  useEffect(() => {
    if (!data) return;
    const scroll = Number(sessionStorage.getItem(briefingScrollKey));
    if (!Number.isFinite(scroll)) return;
    sessionStorage.removeItem(briefingScrollKey);
    requestAnimationFrame(() => window.scrollTo({ top: Math.max(0, scroll) }));
  }, [data]);
  const projects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...(data?.projects ?? [])].filter((project: any) => {
      const progress = projectProgress(project);
      const matchesStatus = filter === "all" || project.status === filter;
      const matchesProgress = progressFilter === "all"
        || (progressFilter === "early" && progress < 35)
        || (progressFilter === "mid" && progress >= 35 && progress < 75)
        || (progressFilter === "late" && progress >= 75 && progress < 100)
        || (progressFilter === "done" && progress === 100);
      const dueDays = daysUntil(project.due_date);
      const matchesDeadline = deadlineFilter === "all"
        || (deadlineFilter === "overdue" && dueDays !== null && dueDays < 0)
        || (deadlineFilter === "next14" && dueDays !== null && dueDays >= 0 && dueDays <= 14)
        || (deadlineFilter === "next30" && dueDays !== null && dueDays >= 0 && dueDays <= 30)
        || (deadlineFilter === "none" && dueDays === null);
      const updateAge = ageInDays(project.progress_updated_at || project.updated_at || project.created_at);
      const matchesFreshness = freshnessFilter === "all"
        || (freshnessFilter === "updated7" && updateAge !== null && updateAge <= 7)
        || (freshnessFilter === "stale14" && (updateAge === null || updateAge > 14))
        || (freshnessFilter === "no_update" && !project.current_update);
      const linkText = (project.links ?? []).map((link: any) => `${link.title} ${link.url}`).join(" ");
      const haystack = `${project.project_no} ${project.name} ${project.owner_name ?? ""} ${project.department_name ?? ""} ${project.current_update ?? ""} ${linkText}`.toLowerCase();
      return matchesStatus && matchesProgress && matchesDeadline && matchesFreshness && haystack.includes(query);
    }).sort((left: any, right: any) => compareProjects(left, right, sort));
  }, [data, filter, progressFilter, deadlineFilter, freshnessFilter, sort, search]);
  if (error && !data) return <ErrorNotice message={error} />;
  if (!data) return <Loading />;

  return <>
    <PageHeader eyebrow="Executive reporting" title="Progress Briefing" description="A presentation-ready view of every DTU project, its latest progress, evidence, and delivery position." />
    <section className="briefing-hero">
      <div><span>Portfolio pulse</span><h2>{data.stats.active} projects actively moving</h2><p>Select any project to present its update history, progress photos, and current work.</p></div>
      <div className="briefing-storage"><small>Project image storage</small><strong>{formatBytes(data.stats.imageBytes)}</strong><span>{data.stats.imageCount} project and progress images · {formatBytes(data.stats.freeBytes)} free locally</span></div>
    </section>
    <section className="stat-grid briefing-stats">
      <StatCard label="Portfolio projects" value={data.stats.total} tone="blue" note="Management view" icon={<ProjectIcon />} />
      <StatCard label="In progress" value={data.stats.inProgress ?? data.stats.active} tone="amber" note="Currently moving" icon={<ArrowIcon />} />
      <StatCard label="Monitoring" value={data.stats.monitoring ?? 0} tone="green" note="Complete & observing" icon={<CheckIcon />} />
      <StatCard label="On hold" value={data.stats.onHold} tone="amber" note="Needs discussion" icon={<ClockIcon />} />
      <StatCard label="Completed" value={data.stats.completed} tone="green" note="Closed delivery" icon={<CheckIcon />} />
    </section>
    <div className="briefing-toolbar">
      <div className="briefing-filters">
        {briefingStatusFilters.map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
      <div className="briefing-advanced-filters">
        <label>Progress<select value={progressFilter} onChange={event => setProgressFilter(event.target.value)}>
          <option value="all">Any progress</option><option value="early">0-34%</option><option value="mid">35-74%</option><option value="late">75-99%</option><option value="done">100%</option>
        </select></label>
        <label>Deadline<select value={deadlineFilter} onChange={event => setDeadlineFilter(event.target.value)}>
          <option value="all">Any deadline</option><option value="overdue">Overdue</option><option value="next14">Next 14 days</option><option value="next30">Next 30 days</option><option value="none">No deadline</option>
        </select></label>
        <label>Update age<select value={freshnessFilter} onChange={event => setFreshnessFilter(event.target.value)}>
          <option value="all">Any update age</option><option value="updated7">Updated 7 days</option><option value="stale14">Stale 14+ days</option><option value="no_update">No management update</option>
        </select></label>
        <label>Sort by<select value={sort} onChange={event => setSort(event.target.value)}>
          <option value="updated_desc">Latest update</option><option value="project_no_asc">Project ID ascending</option><option value="project_no_desc">Project ID descending</option><option value="created_desc">Newest project</option><option value="deadline_asc">Nearest deadline</option><option value="progress_desc">Highest progress</option><option value="progress_asc">Lowest progress</option><option value="priority">Priority first</option>
        </select></label>
      </div>
      <div className="briefing-result-summary"><strong>{projects.length}</strong> of {data.stats.total} projects shown</div>
      <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search projects or updates…" />
    </div>
    {projects.length ? <div className="briefing-project-grid">{projects.map((project: any) => <BriefingProjectCard project={project} presentationOrder={projects} key={project.id} />)}</div> : <Empty title="No projects match this view" />}
  </>;
}

function BriefingProjectCard({ project, presentationOrder }: { project: any; presentationOrder: any[] }) {
  const progress = projectProgress(project);
  const linkCount = project.links?.length ?? 0;
  const preparePresentation = () => {
    sessionStorage.setItem(briefingOrderKey, JSON.stringify(presentationOrder.map(item => ({ id: item.id, project_no: item.project_no, name: item.name }))));
    sessionStorage.setItem(briefingScrollKey, String(window.scrollY));
  };
  return <Link to={`/briefing/${project.id}`} className="briefing-project-card" onClick={preparePresentation}>
    <div className="briefing-project-image">
      {project.has_project_image
        ? <img src={`/api/staff/projects/${project.id}/image?v=${encodeURIComponent(project.updated_at)}`} alt={`${project.name} project cover`} />
        : project.latest_image_id
        ? <img src={`/api/staff/briefing/images/${project.latest_image_id}`} alt="" />
        : <div className="briefing-image-placeholder"><ProjectIcon /><span>No project photo yet</span></div>}
      <span className="mono">{project.project_no}</span>
    </div>
    <div className="briefing-card-body">
      <div className="briefing-card-status"><Badge value={project.status} /><Badge value={project.priority} kind="priority" /></div>
      <h2>{project.name}</h2>
      <p>{project.current_update || "No current progress update has been published yet."}</p>
      <div className="briefing-progress"><div><span>Delivery progress</span><strong>{progress}%</strong></div><div className="bar"><i style={{ width: `${progress}%` }} /></div></div>
      {linkCount > 0 && <div className="briefing-card-links"><span>System links</span><strong>{linkCount}</strong></div>}
      <footer><span><small>Owner</small>{project.owner_name || "Unassigned"}</span><span><small>Due</small>{formatDate(project.due_date)}</span><span><small>Open work</small>{project.open_work_count}</span></footer>
    </div>
  </Link>;
}

export function BriefingProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [showUpdate, setShowUpdate] = useState(false);
  const [showWorkItem, setShowWorkItem] = useState(false);
  const [selectedImage, setSelectedImage] = useState<any>(null);
  const [error, setError] = useState("");
  const load = () => api(`/api/staff/briefing/projects/${id}`).then(setData).catch(err => setError(err.message));
  useEffect(() => {
    setData(null);
    setError("");
    window.scrollTo({ top: 0 });
    void load();
  }, [id]);
  useEffect(() => { void api<any[]>("/api/staff/users").then(setUsers).catch(() => undefined); }, []);
  useEffect(() => {
    if (!data) return;
    document.title = `${data.project.name} · Progress Briefing`;
    return () => { document.title = "DTU Control Centre"; };
  }, [data]);
  if (error && !data) return <ErrorNotice message={error} />;
  if (!data) return <Loading />;
  const { project, updates, workItems, links = [] } = data;
  const progress = projectProgress(project);
  const allImages = updates.flatMap((update: any) => update.images.map((image: any) => ({ ...image, update })));
  const openWork = workItems.filter((item: any) => !["resolved", "closed"].includes(item.status));
  const savedOrder = savedPresentationOrder();
  const presentationOrder: PresentationProject[] = savedOrder.some(item => String(item.id) === String(project.id)) ? savedOrder : data.navigationProjects;
  const currentIndex = presentationOrder.findIndex(item => String(item.id) === String(project.id));
  const previousProject = currentIndex > 0 ? presentationOrder[currentIndex - 1] : null;
  const nextProject = currentIndex >= 0 && currentIndex < presentationOrder.length - 1 ? presentationOrder[currentIndex + 1] : null;
  const goToProject = (projectId: number) => navigate(`/briefing/${projectId}`);

  return <>
    <div className="briefing-back-row"><button className="briefing-back-link" onClick={() => navigate("/briefing")}>← Portfolio briefing</button><div className="briefing-primary-actions"><button className="button button-secondary" onClick={() => setShowWorkItem(true)}><PlusIcon /> Add task / issue</button><button className="button button-primary" onClick={() => setShowUpdate(true)}>Management update</button></div></div>
    <nav className="briefing-presentation-nav" aria-label="Project presentation navigation">
      <button type="button" disabled={!previousProject} onClick={() => previousProject && goToProject(previousProject.id)}><span>← Previous</span><small>{previousProject?.project_no || "Start of list"}</small></button>
      <label><span>Presenting project <strong>{currentIndex + 1} of {presentationOrder.length}</strong></span><select value={project.id} onChange={event => goToProject(Number(event.target.value))}>{presentationOrder.map(item => <option value={item.id} key={item.id}>{item.project_no} · {item.name}</option>)}</select></label>
      <button type="button" disabled={!nextProject} onClick={() => nextProject && goToProject(nextProject.id)}><span>Next →</span><small>{nextProject?.project_no || "End of list"}</small></button>
    </nav>
    <section className={`briefing-detail-hero${project.has_project_image ? " has-project-image" : ""}`}>
      {project.has_project_image && <img className="briefing-detail-cover" src={`/api/staff/projects/${project.id}/image?v=${encodeURIComponent(project.updated_at)}`} alt="" />}
      <div className="briefing-detail-copy"><span className="mono">{project.project_no}</span><div><Badge value={project.status} /><Badge value={project.priority} kind="priority" /></div><h1>{project.name}</h1><p>{project.description || "No project description has been added."}</p></div>
      <div className="briefing-progress-orbit"><strong>{progress}%</strong><span>delivery progress</span><i style={{ "--progress": `${progress * 3.6}deg` } as CSSProperties} /></div>
      <div className="briefing-detail-facts"><div><small>Owner</small><strong>{project.owner_name || "Unassigned"}</strong></div><div><small>Department</small><strong>{project.department_name}</strong></div><div><small>Due date</small><strong>{formatDate(project.due_date)}</strong></div><div><small>Open work</small><strong>{openWork.length}</strong></div></div>
    </section>
    <div className="briefing-detail-grid">
      <main>
        <section className="panel briefing-current-update"><div className="panel-heading"><div><span className="eyebrow">Latest position</span><h2>Current management update</h2></div>{project.progress_updated_at && <time>{formatDate(project.progress_updated_at, true)}</time>}</div>
          <p>{project.current_update || "No current progress update has been published."}</p>
          <small>Updated by {project.progress_updated_by_name || project.owner_name || "DTU"}</small>
        </section>
        <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Delivery narrative</span><h2>Progress history</h2></div><b>{updates.length} updates</b></div>
          {updates.length ? <div className="briefing-timeline">{updates.map((update: any) => <article key={update.id}>
            <div className="briefing-timeline-marker"><i /></div>
            <div><header><div><strong>{update.author_name}</strong><span>{formatDate(update.created_at, true)}</span></div><div><Badge value={update.status} /><b>{update.progress}%</b></div></header><p>{update.body}</p>
              {update.images.length > 0 && <div className="briefing-inline-gallery">{update.images.map((image: any) => <button key={image.id} onClick={() => setSelectedImage({ ...image, update })}><img src={`/api/staff/briefing/images/${image.id}`} alt={image.original_name} /></button>)}</div>}
            </div>
          </article>)}</div> : <Empty title="No progress history yet" body="Publish the first management update for this project." />}
        </section>
      </main>
      <aside>
        <BriefingSystemLinks links={links} />
        <section className="panel briefing-gallery-panel"><div className="panel-heading"><div><span className="eyebrow">Visual evidence</span><h2>Progress gallery</h2></div><b>{allImages.length}</b></div>
          {allImages.length ? <div className="briefing-gallery">{allImages.map((image: any) => <button key={image.id} onClick={() => setSelectedImage(image)}><img src={`/api/staff/briefing/images/${image.id}`} alt={image.original_name} /><span>{formatDate(image.created_at)}</span></button>)}</div> : <div className="briefing-gallery-empty"><ProjectIcon /><span>Add progress photos with the next update.</span></div>}
        </section>
        <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Execution</span><h2>Current work</h2></div><div className="briefing-panel-actions"><button type="button" onClick={() => setShowWorkItem(true)}>+ Add work</button><Link to={`/tickets?projectId=${project.id}`}>Open queue →</Link></div></div>
          {openWork.length ? <div className="briefing-work-list">{openWork.slice(0, 8).map((item: any) => <Link to={`/tickets/${item.id}`} key={item.id}><div><span className="mono">{item.ticket_no}</span><Badge value={item.priority} kind="priority" /></div><strong>{item.title}</strong><small>{item.assignee_name || "Unassigned"} · {formatDate(item.due_date)}</small></Link>)}</div> : <Empty title="No open work" />}
        </section>
      </aside>
    </div>
    {showUpdate && <BriefingUpdateModal project={project} onClose={() => setShowUpdate(false)} onSaved={() => { setShowUpdate(false); void load(); }} />}
    {showWorkItem && <BriefingWorkItemModal project={project} users={users} onClose={() => setShowWorkItem(false)} onSaved={() => { setShowWorkItem(false); void load(); }} />}
    {selectedImage && <Modal title={selectedImage.original_name} onClose={() => setSelectedImage(null)} wide><div className="briefing-lightbox"><img src={`/api/staff/briefing/images/${selectedImage.id}`} alt={selectedImage.original_name} /><p>{selectedImage.update?.body}</p><small>{selectedImage.update ? `${selectedImage.update.author_name} · ${formatDate(selectedImage.update.created_at, true)}` : formatDate(selectedImage.created_at, true)}</small></div></Modal>}
  </>;
}

function BriefingWorkItemModal({ project, users, onClose, onSaved }: { project: any; users: any[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ type: "task", title: "", description: "", priority: "medium", assigneeId: "", dueDate: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/api/staff/tickets", json("POST", {
        projectId: project.id,
        type: form.type,
        title: form.title,
        description: form.description,
        priority: form.priority,
        status: form.assigneeId ? "assigned" : "new",
        assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
        dueDate: form.dueDate || null
      }));
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };
  return <Modal title="Add task or issue" onClose={onClose} wide><form className="form-stack" onSubmit={save}>
    <ErrorNotice message={error} />
    <div className="progress-update-summary"><span className="mono">{project.project_no}</span><strong>{project.name}</strong><small>Create delivery work without leaving the management briefing. The selected PIC will be notified automatically.</small></div>
    <div className="form-grid"><label>Work type<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}><option value="task">Task</option><option value="issue">Issue</option></select></label><label>PIC / assignee<select value={form.assigneeId} onChange={event => setForm({ ...form, assigneeId: event.target.value })}><option value="">Unassigned</option>{users.filter(user => user.active).map(user => <option value={user.id} key={user.id}>{user.name}</option>)}</select></label></div>
    <label>Title<input required minLength={3} maxLength={200} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder={form.type === "task" ? "What needs to be completed?" : "What needs attention?"} /></label>
    <label>Description<textarea rows={5} maxLength={5000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Add the expected outcome, context, or next action." /></label>
    <div className="form-grid"><label>Priority<select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label><label>Due date<input type="date" value={form.dueDate} onChange={event => setForm({ ...form, dueDate: event.target.value })} /></label></div>
    <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Creating…" : `Create ${form.type}`}</button></div>
  </form></Modal>;
}

function BriefingSystemLinks({ links }: { links: any[] }) {
  return <section className="panel briefing-system-links">
    <div className="panel-heading"><div><span className="eyebrow">System access</span><h2>System links</h2></div><b>{links.length}</b></div>
    {links.length ? <div className="system-link-grid">
      {links.map((link: any) => <a className="system-link-card" href={link.url} target="_blank" rel="noreferrer" key={link.id}>
        <small>Open system</small><strong>{link.title}</strong><span>{shortUrl(link.url)}</span>
      </a>)}
    </div> : <Empty title="No system links yet" body="Add links from the project edit view." />}
  </section>;
}

function BriefingUpdateModal({ project, onClose, onSaved }: { project: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ status: project.status, progress: project.progress, currentUpdate: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);
  const chooseFiles = async (list: FileList | null) => {
    setError("");
    const selected = Array.from(list ?? []).slice(0, 4);
    try {
      const compressed = await Promise.all(selected.map(compressProgressImage));
      previews.forEach(URL.revokeObjectURL);
      setFiles(compressed);
      setPreviews(compressed.map(file => URL.createObjectURL(file)));
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const body = new FormData();
    body.set("status", form.status);
    body.set("progress", String(form.progress));
    body.set("currentUpdate", form.currentUpdate);
    files.forEach(file => body.append("images", file));
    try {
      await api(`/api/staff/briefing/projects/${project.id}/updates`, { method: "POST", body });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };
  return <Modal title="Publish progress update" onClose={onClose} wide><form className="form-stack" onSubmit={save}>
    <ErrorNotice message={error} />
    <div className="progress-update-summary"><span className="mono">{project.project_no}</span><strong>{project.name}</strong><small>This update becomes the current management position and is added to the project history.</small></div>
    <div className="form-grid"><label>Status<select value={form.status} onChange={event => {
      const status = event.target.value;
      setForm({ ...form, status, progress: completeLikeProjectStatuses.has(status) ? 100 : form.progress });
    }}>{projectStatusOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Progress ({form.progress}%)<input type="range" min="0" max="100" step="5" disabled={completeLikeProjectStatuses.has(form.status)} value={form.progress} onChange={event => setForm({ ...form, progress: Number(event.target.value) })} /></label></div>
    <label>Management update<textarea required minLength={3} maxLength={3000} rows={6} value={form.currentUpdate} onChange={event => setForm({ ...form, currentUpdate: event.target.value })} placeholder="What moved forward, what is next, what decision is needed, and what is blocked?" /></label>
    <label className="briefing-photo-picker">Progress photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => void chooseFiles(event.target.files)} /><small>Up to 4 images. Large photos are compressed to presentation size before upload.</small></label>
    {previews.length > 0 && <div className="briefing-upload-previews">{previews.map((preview, index) => <img src={preview} alt={`Selected progress ${index + 1}`} key={preview} />)}</div>}
    <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Publishing…" : "Publish update"}</button></div>
  </form></Modal>;
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

function ageInDays(value?: string | null) {
  const time = parseProjectDate(value);
  if (time === null) return null;
  return Math.floor((Date.now() - time) / 86_400_000);
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
  if (sort === "deadline_asc") return compareDateAsc(left.due_date, right.due_date) || comparePriority(left, right) || compareProjectNo(left, right);
  if (sort === "progress_desc") return projectProgress(right) - projectProgress(left) || comparePriority(left, right) || compareProjectNo(left, right);
  if (sort === "progress_asc") return projectProgress(left) - projectProgress(right) || comparePriority(left, right) || compareProjectNo(left, right);
  if (sort === "priority") return comparePriority(left, right) || compareDateAsc(left.due_date, right.due_date) || compareProjectNo(left, right);
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
  return (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9);
}

function formatBytes(value: number) {
  if (value < 1024 ** 2) return `${Math.max(0, value / 1024).toFixed(value ? 1 : 0)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}
