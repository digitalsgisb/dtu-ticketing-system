import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { useAuth } from "../auth";
import { Badge, Empty, ErrorNotice, Loading, Modal, PageHeader } from "../components/UI";
import { useI18n } from "../i18n";
import { CompanyLogo } from "../components/CompanyLogo";
import { compressProgressImage } from "../progressImages";

const completeLikeProjectStatuses = new Set(["complete_monitoring", "completed"]);
const projectStatusOptions = [
  ["planned", "Planned"],
  ["in_progress", "In progress"],
  ["on_hold", "On hold"],
  ["complete_monitoring", "Complete and Monitoring"],
  ["completed", "Completed"]
] as const;
const projectLinkSlotCount = 4;
const projectNavigationKey = "dtu-project-presentation";

type ProjectNavigationItem = { id: number; project_no: string; name: string };

function savedProjectNavigation(): { projects: ProjectNavigationItem[]; returnTo: string } {
  try {
    const saved = JSON.parse(sessionStorage.getItem(projectNavigationKey) || "{}");
    return {
      projects: Array.isArray(saved.projects) ? saved.projects : [],
      returnTo: saved.returnTo === "/my-projects" ? "/my-projects" : "/projects"
    };
  } catch { return { projects: [], returnTo: "/projects" }; }
}

type ProjectLinkForm = {
  title: string;
  url: string;
};

function projectLinkSlots(links: any[] = []): ProjectLinkForm[] {
  const filled = links.slice(0, projectLinkSlotCount).map(link => ({
    title: String(link.title ?? ""),
    url: String(link.url ?? "")
  }));
  return [...filled, ...Array.from({ length: Math.max(0, projectLinkSlotCount - filled.length) }, () => ({ title: "", url: "" }))];
}

function shortUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}

export function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  const [qr, setQr] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [updatingProgress, setUpdatingProgress] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [selectedImage, setSelectedImage] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState("");
  const load = () => api(`/api/staff/projects/${id}`).then(next => { setData(next); setError(""); }).catch(e => setError(e.message));
  useEffect(() => {
    let cancelled = false;
    const changingProject = data !== null;
    setError("");
    if (changingProject) {
      setTransitioning(true);
      window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
    void api(`/api/staff/projects/${id}`).then(next => {
      if (cancelled) return;
      setData(next);
      requestAnimationFrame(() => setTransitioning(false));
    }).catch(e => {
      if (cancelled) return;
      setError(e.message);
      setTransitioning(false);
    });
    return () => { cancelled = true; };
  }, [id]);
  useEffect(() => {
    if (user?.role === "member") return;
    void api<any[]>("/api/staff/users").then(setUsers).catch(() => undefined);
  }, [user?.role]);
  if (error && !data) return <ErrorNotice message={error} />;
  if (!data) return <Loading />;
  const { project, workItems, links = [], updates = [] } = data;
  const displayedProgress = completeLikeProjectStatuses.has(project.status) ? 100 : project.progress;
  const canManageProjects = user?.role === "admin" || user?.role === "lead";
  const ownsProject = Number(project.owner_id) === user?.id || String(project.owner_name ?? "").trim().toLowerCase() === user?.name.trim().toLowerCase();
  const canUpdateProgress = project.status !== "cancelled" && Boolean(user) && (canManageProjects || ownsProject);
  const savedNavigation = savedProjectNavigation();
  const presentationOrder: ProjectNavigationItem[] = savedNavigation.projects.some(item => String(item.id) === String(project.id)) ? savedNavigation.projects : data.navigationProjects;
  const currentIndex = presentationOrder.findIndex(item => String(item.id) === String(project.id));
  const previousProject = currentIndex > 0 ? presentationOrder[currentIndex - 1] : null;
  const nextProject = currentIndex >= 0 && currentIndex < presentationOrder.length - 1 ? presentationOrder[currentIndex + 1] : null;
  const goToProject = (projectId: number) => navigate(`/projects/${projectId}`);

  return <>
    <div className="project-detail-back-row"><button type="button" className="briefing-back-link" onClick={() => navigate(savedNavigation.returnTo)}>← Project portfolio</button></div>
    <nav className="briefing-presentation-nav project-presentation-nav" aria-label="Project navigation">
      <button type="button" disabled={transitioning || !previousProject} onClick={() => previousProject && goToProject(previousProject.id)}><span>← Previous</span><small>{previousProject?.project_no || "Start of list"}</small></button>
      <label><span>Viewing project <strong>{currentIndex + 1} of {presentationOrder.length}</strong></span><select disabled={transitioning} value={project.id} onChange={event => goToProject(Number(event.target.value))}>{presentationOrder.map(item => <option value={item.id} key={item.id}>{item.project_no} · {item.name}</option>)}</select></label>
      <button type="button" disabled={transitioning || !nextProject} onClick={() => nextProject && goToProject(nextProject.id)}><span>Next →</span><small>{nextProject?.project_no || "End of list"}</small></button>
    </nav>
    <div className={`project-detail-stage${transitioning ? " is-switching" : ""}`} key={project.id} aria-busy={transitioning}>
    <PageHeader eyebrow={project.project_no} title={project.name} description={project.description || "No description has been added."} actions={<>
      <button className="button button-secondary" onClick={() => void api(`/api/staff/projects/${id}/qr`).then(setQr)}>QR label</button>
      {canUpdateProgress && <button className="button button-secondary" onClick={() => setUpdatingProgress(true)}>Update progress</button>}
      {user?.role !== "member" && <button className="button button-primary" onClick={() => setEditing(true)}>Edit project</button>}
    </>} />
    <div className={`project-overview${project.latest_image_id ? " has-photo" : ""}`}>
    {project.latest_image_id ? <figure className="project-detail-cover">
      <img className="project-detail-cover-backdrop" src={`/api/staff/projects/progress-images/${project.latest_image_id}`} alt="" aria-hidden="true" />
      <img className="project-detail-cover-foreground" src={`/api/staff/projects/progress-images/${project.latest_image_id}`} alt={`Latest progress for ${project.name}`} />
      <figcaption>Latest progress photo</figcaption>
    </figure> : null}
    <section className="detail-hero">
      <div className="detail-status"><Badge value={project.status} /><Badge value={project.priority} kind="priority" /></div>
      <div className="detail-facts">
        <div><small>{t("department")}</small><strong>{project.department_name}</strong></div>
        <div><small>{t("owner")}</small><strong>{project.owner_name || "Unassigned"}</strong></div>
        <div><small>{t("dueDate")}</small><strong>{formatDate(project.due_date)}</strong></div>
        <div><small>{t("progress")}</small><strong>{displayedProgress}%</strong></div>
      </div>
      <div className="hero-progress"><i style={{ width: `${displayedProgress}%` }} /></div>
    </section>
    </div>
    <SystemLinks links={links} />
    <section className="project-update-panel">
      <div className="project-update-heading">
        <div><span className="eyebrow">Owner update</span><h2>Current progress</h2></div>
        {project.progress_updated_at && <time>{formatDate(project.progress_updated_at, true)}</time>}
      </div>
      {project.current_update
        ? <><p>{project.current_update}</p><small>Updated by {project.progress_updated_by_name || project.owner_name || "project owner"}</small></>
        : <p className="project-update-empty">No progress note yet. The project owner can add the first delivery update here.</p>}
    </section>
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">Progress evidence</span><h2>Progress history</h2></div><b>{updates.length} updates</b></div>
      {updates.length ? <div className="briefing-timeline">{updates.map((update: any) => <article key={update.id}>
        <div className="briefing-timeline-marker"><i /></div>
        <div><header><div><strong>{update.author_name}</strong><span>{formatDate(update.created_at, true)}</span></div><div><Badge value={update.status} /><b>{update.progress}%</b></div></header><p>{update.body}</p>
          {update.images.length > 0 && <div className="briefing-inline-gallery">{update.images.map((image: any) => <button key={image.id} onClick={() => setSelectedImage({ ...image, update })}><img src={`/api/staff/projects/progress-images/${image.id}`} alt={image.original_name} /></button>)}</div>}
        </div>
      </article>)}</div> : <Empty title="No progress history yet" body={canUpdateProgress ? "Publish the first project progress update with supporting photos." : "The project owner can publish the first progress update."} />}
    </section>
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">Delivery & support</span><h2>Project work</h2></div><Link className="button button-secondary" to={`/tickets?projectId=${project.id}`}>Open full queue</Link></div>
      {workItems.length ? <div className="data-table">
        <div className="table-head"><span>Reference</span><span>Work item</span><span>{t("assignee")}</span><span>{t("dueDate")}</span><span>{t("status")}</span></div>
        {workItems.map((item: any) => <Link to={`/tickets/${item.id}`} className="table-row" key={item.id}><span className="mono">{item.ticket_no}</span><span><strong>{item.title}</strong><small><Badge value={item.type} kind="type" /></small></span><span>{item.assignee_name || "Unassigned"}</span><span>{formatDate(item.due_date)}</span><span><Badge value={item.status} /></span></Link>)}
      </div> : <Empty body="Create the first task or issue for this project." />}
    </section>
    </div>
    {editing && <EditProject project={project} users={users} links={links} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); }} />}
    {updatingProgress && <ProgressUpdate project={project} onClose={() => setUpdatingProgress(false)} onSaved={() => { setUpdatingProgress(false); void load(); }} />}
    {selectedImage && <Modal title={selectedImage.original_name} onClose={() => setSelectedImage(null)} wide><div className="briefing-lightbox"><img src={`/api/staff/projects/progress-images/${selectedImage.id}`} alt={selectedImage.original_name} /><p>{selectedImage.update?.body}</p><small>{selectedImage.update ? `${selectedImage.update.author_name} - ${formatDate(selectedImage.update.created_at, true)}` : formatDate(selectedImage.created_at, true)}</small></div></Modal>}
    {qr && <QrModal qr={qr} onClose={() => setQr(null)} />}
  </>;
}

function SystemLinks({ links }: { links: any[] }) {
  const slots = projectLinkSlots(links);
  return <section className="system-links-panel">
    <div className="panel-heading"><div><span className="eyebrow">System access</span><h2>System links</h2></div></div>
    <div className="system-link-grid">
      {slots.map((link, index) => link.url
        ? <a className="system-link-card" href={link.url} target="_blank" rel="noreferrer" key={index}>
          <small>System link {index + 1}</small><strong>{link.title}</strong><span>{shortUrl(link.url)}</span>
        </a>
        : <div className="system-link-card system-link-placeholder" key={index}>
          <small>System link {index + 1}</small><strong>Not set</strong><span>Placeholder</span>
        </div>)}
    </div>
  </section>;
}

function ProgressUpdate({ project, onClose, onSaved }: { project: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
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
      setFiles(compressed);
      setPreviews(compressed.map(file => URL.createObjectURL(file)));
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    const body = new FormData();
    body.set("status", form.status);
    body.set("progress", String(form.progress));
    body.set("currentUpdate", form.currentUpdate);
    files.forEach(file => body.append("images", file));
    try {
      await api(`/api/staff/projects/${project.id}/progress`, { method: "PATCH", body });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };
  return <Modal title="Update project progress" onClose={onClose}>
    <form className="form-stack" onSubmit={save}>
      <ErrorNotice message={error} />
      <div className="progress-update-summary"><span className="mono">{project.project_no}</span><strong>{project.name}</strong><small>Share a concise update that the team can understand at a glance.</small></div>
      <div className="form-grid">
        <label>{t("status")}<select value={form.status} onChange={e => {
          const status = e.target.value;
          setForm({ ...form, status, progress: completeLikeProjectStatuses.has(status) ? 100 : form.progress });
        }}>{projectStatusOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>{t("progress")} ({form.progress}%)<input type="range" min="0" max="100" step="5" disabled={completeLikeProjectStatuses.has(form.status)} value={form.progress} onChange={e => setForm({ ...form, progress: Number(e.target.value) })} /></label>
      </div>
      <label>Current update<textarea required minLength={3} maxLength={1000} rows={5} value={form.currentUpdate} onChange={e => setForm({ ...form, currentUpdate: e.target.value })} placeholder="What has moved forward, what is next, and is anything blocked?" /></label>
      <label className="briefing-photo-picker">Progress photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => void chooseFiles(e.target.files)} /><small>Up to 4 images. Large photos are compressed before upload.</small></label>
      {previews.length > 0 && <div className="briefing-upload-previews">{previews.map((preview, index) => <img src={preview} alt={`Selected progress ${index + 1}`} key={preview} />)}</div>}
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>{t("cancel")}</button><button className="button button-primary" disabled={saving}>{saving ? "Saving..." : "Publish update"}</button></div>
    </form>
  </Modal>;
}

function EditProject({ project, users, links: projectLinks, onClose, onSaved }: { project: any; users: any[]; links: any[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: project.name, description: project.description, departmentName: project.department_name, ownerId: project.owner_id ? String(project.owner_id) : "", status: project.status, priority: project.priority, dueDate: project.due_date || "", progress: project.progress });
  const [links, setLinks] = useState<ProjectLinkForm[]>(projectLinkSlots(projectLinks));
  const [error, setError] = useState("");
  const ownerOptions = users.filter(u => u.active || String(u.id) === form.ownerId);
  const updateLink = (index: number, patch: Partial<ProjectLinkForm>) => {
    setLinks(current => current.map((link, itemIndex) => itemIndex === index ? { ...link, ...patch } : link));
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api(`/api/staff/projects/${project.id}`, json("PATCH", {
        ...form,
        ownerId: form.ownerId ? Number(form.ownerId) : null,
        dueDate: form.dueDate || null,
        progress: Number(form.progress),
        links
      }));
      onSaved();
    }
    catch (err) { setError((err as Error).message); }
  };
  return <Modal title="Edit project" onClose={onClose}><form className="form-stack" onSubmit={save}><ErrorNotice message={error} />
    <label>{t("title")}<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
    <label>{t("description")}<textarea rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
    <div className="form-grid">
      <label>{t("owner")}<select value={form.ownerId} onChange={e => setForm({ ...form, ownerId: e.target.value })}><option value="">Unassigned</option>{ownerOptions.map(u => <option value={u.id} key={u.id}>{u.name}</option>)}</select></label>
      <label>{t("status")}<select value={form.status} onChange={e => {
        const status = e.target.value;
        setForm({ ...form, status, progress: completeLikeProjectStatuses.has(status) ? 100 : form.progress });
      }}>{projectStatusOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}<option value="cancelled">Cancelled</option></select></label>
      <label>{t("priority")}<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label>
      <label>{t("dueDate")}<input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></label>
      <label>{t("progress")} ({form.progress}%)<input type="range" min="0" max="100" step="5" value={form.progress} onChange={e => setForm({ ...form, progress: Number(e.target.value) })} /></label>
    </div>
    <div className="project-link-editor">
      <div className="project-link-editor-heading"><span className="eyebrow">System links</span><small>{projectLinkSlotCount} slots</small></div>
      {links.map((link, index) => <div className="project-link-row" key={index}>
        <label>Title<input maxLength={80} value={link.title} onChange={e => updateLink(index, { title: e.target.value })} placeholder={`System link ${index + 1}`} /></label>
        <label>URL<input inputMode="url" maxLength={1000} value={link.url} onChange={e => updateLink(index, { url: e.target.value })} placeholder="https://example.com" /></label>
      </div>)}
    </div>
    <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>{t("cancel")}</button><button className="button button-primary">{t("save")}</button></div>
  </form></Modal>;
}

function QrModal({ qr, onClose }: { qr: any; onClose: () => void }) {
  const print = () => window.print();
  return <Modal title="Printable project QR label" onClose={onClose}>
    <div className="qr-label" id="qr-label"><div className="qr-company"><CompanyLogo /><span>Digital Transformation Unit</span></div><img className="qr-code" src={qr.dataUrl} alt="Project issue reporting QR code" /><h2>{qr.project.name}</h2><strong>{qr.project.project_no}</strong><p>Report Issue / Lapor Masalah</p><small>{qr.url}</small></div>
    <div className="form-actions"><button className="button button-secondary" onClick={onClose}>Close</button><button className="button button-primary" onClick={print}>Print label</button></div>
  </Modal>;
}
