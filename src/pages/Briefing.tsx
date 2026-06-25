import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatDate } from "../api";
import { ArrowIcon, CheckIcon, ClockIcon, ProjectIcon } from "../components/Icons";
import { Badge, Empty, ErrorNotice, Loading, Modal, PageHeader, StatCard } from "../components/UI";

export function ProgressBriefingPage() {
  const [data, setData] = useState<any>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    document.title = "Progress Briefing · DTU";
    void api("/api/staff/briefing").then(setData).catch(err => setError(err.message));
    return () => { document.title = "DTU Control Centre"; };
  }, []);
  const projects = useMemo(() => (data?.projects ?? []).filter((project: any) => {
    const matchesFilter = filter === "all" || project.status === filter;
    const haystack = `${project.project_no} ${project.name} ${project.owner_name ?? ""} ${project.current_update ?? ""}`.toLowerCase();
    return matchesFilter && haystack.includes(search.toLowerCase());
  }), [data, filter, search]);
  if (error && !data) return <ErrorNotice message={error} />;
  if (!data) return <Loading />;

  return <>
    <PageHeader eyebrow="Executive reporting" title="Progress Briefing" description="A presentation-ready view of every DTU project, its latest progress, evidence, and delivery position." />
    <section className="briefing-hero">
      <div><span>Portfolio pulse</span><h2>{data.stats.active} projects actively moving</h2><p>Select any project to present its update history, progress photos, and current work.</p></div>
      <div className="briefing-storage"><small>Progress photo storage</small><strong>{formatBytes(data.stats.imageBytes)}</strong><span>{data.stats.imageCount} images · {formatBytes(data.stats.freeBytes)} free locally</span></div>
    </section>
    <section className="stat-grid briefing-stats">
      <StatCard label="Portfolio projects" value={data.stats.total} tone="blue" note="Management view" icon={<ProjectIcon />} />
      <StatCard label="In progress" value={data.stats.active} tone="green" note="Currently moving" icon={<ArrowIcon />} />
      <StatCard label="On hold" value={data.stats.onHold} tone="amber" note="Needs discussion" icon={<ClockIcon />} />
      <StatCard label="Completed" value={data.stats.completed} tone="green" note="Delivered" icon={<CheckIcon />} />
    </section>
    <div className="briefing-toolbar">
      <div className="briefing-filters">
        {["all", "in_progress", "on_hold", "planned", "completed"].map(value => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value.replaceAll("_", " ")}</button>)}
      </div>
      <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search projects or updates…" />
    </div>
    {projects.length ? <div className="briefing-project-grid">{projects.map((project: any) => <BriefingProjectCard project={project} key={project.id} />)}</div> : <Empty title="No projects match this view" />}
  </>;
}

function BriefingProjectCard({ project }: { project: any }) {
  const progress = project.status === "completed" ? 100 : project.progress;
  return <Link to={`/briefing/${project.id}`} className="briefing-project-card">
    <div className="briefing-project-image">
      {project.latest_image_id
        ? <img src={`/api/staff/briefing/images/${project.latest_image_id}`} alt="" />
        : <div className="briefing-image-placeholder"><ProjectIcon /><span>No progress photo yet</span></div>}
      <span className="mono">{project.project_no}</span>
    </div>
    <div className="briefing-card-body">
      <div className="briefing-card-status"><Badge value={project.status} /><Badge value={project.priority} kind="priority" /></div>
      <h2>{project.name}</h2>
      <p>{project.current_update || "No current progress update has been published yet."}</p>
      <div className="briefing-progress"><div><span>Delivery progress</span><strong>{progress}%</strong></div><div className="bar"><i style={{ width: `${progress}%` }} /></div></div>
      <footer><span><small>Owner</small>{project.owner_name || "Unassigned"}</span><span><small>Due</small>{formatDate(project.due_date)}</span><span><small>Open work</small>{project.open_work_count}</span></footer>
    </div>
  </Link>;
}

export function BriefingProjectPage() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [selectedImage, setSelectedImage] = useState<any>(null);
  const [error, setError] = useState("");
  const load = () => api(`/api/staff/briefing/projects/${id}`).then(setData).catch(err => setError(err.message));
  useEffect(() => { void load(); }, [id]);
  useEffect(() => {
    if (!data) return;
    document.title = `${data.project.name} · Progress Briefing`;
    return () => { document.title = "DTU Control Centre"; };
  }, [data]);
  if (error && !data) return <ErrorNotice message={error} />;
  if (!data) return <Loading />;
  const { project, updates, workItems } = data;
  const progress = project.status === "completed" ? 100 : project.progress;
  const allImages = updates.flatMap((update: any) => update.images.map((image: any) => ({ ...image, update })));
  const openWork = workItems.filter((item: any) => !["resolved", "closed"].includes(item.status));

  return <>
    <div className="briefing-back-row"><Link to="/briefing">← Portfolio briefing</Link><button className="button button-primary" onClick={() => setShowUpdate(true)}>Publish progress update</button></div>
    <section className="briefing-detail-hero">
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
        <section className="panel briefing-gallery-panel"><div className="panel-heading"><div><span className="eyebrow">Visual evidence</span><h2>Progress gallery</h2></div><b>{allImages.length}</b></div>
          {allImages.length ? <div className="briefing-gallery">{allImages.map((image: any) => <button key={image.id} onClick={() => setSelectedImage(image)}><img src={`/api/staff/briefing/images/${image.id}`} alt={image.original_name} /><span>{formatDate(image.created_at)}</span></button>)}</div> : <div className="briefing-gallery-empty"><ProjectIcon /><span>Add progress photos with the next update.</span></div>}
        </section>
        <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Execution</span><h2>Current work</h2></div><Link to={`/tickets?projectId=${project.id}`}>Open queue →</Link></div>
          {openWork.length ? <div className="briefing-work-list">{openWork.slice(0, 8).map((item: any) => <Link to={`/tickets/${item.id}`} key={item.id}><div><span className="mono">{item.ticket_no}</span><Badge value={item.priority} kind="priority" /></div><strong>{item.title}</strong><small>{item.assignee_name || "Unassigned"} · {formatDate(item.due_date)}</small></Link>)}</div> : <Empty title="No open work" />}
        </section>
      </aside>
    </div>
    {showUpdate && <BriefingUpdateModal project={project} onClose={() => setShowUpdate(false)} onSaved={() => { setShowUpdate(false); void load(); }} />}
    {selectedImage && <Modal title={selectedImage.original_name} onClose={() => setSelectedImage(null)} wide><div className="briefing-lightbox"><img src={`/api/staff/briefing/images/${selectedImage.id}`} alt={selectedImage.original_name} /><p>{selectedImage.update?.body}</p><small>{selectedImage.update ? `${selectedImage.update.author_name} · ${formatDate(selectedImage.update.created_at, true)}` : formatDate(selectedImage.created_at, true)}</small></div></Modal>}
  </>;
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
      setForm({ ...form, status, progress: status === "completed" ? 100 : form.progress });
    }}><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="on_hold">On hold</option><option value="completed">Completed</option></select></label>
      <label>Progress ({form.progress}%)<input type="range" min="0" max="100" step="5" disabled={form.status === "completed"} value={form.progress} onChange={event => setForm({ ...form, progress: Number(event.target.value) })} /></label></div>
    <label>Management update<textarea required minLength={3} maxLength={3000} rows={6} value={form.currentUpdate} onChange={event => setForm({ ...form, currentUpdate: event.target.value })} placeholder="What moved forward, what is next, what decision is needed, and what is blocked?" /></label>
    <label className="briefing-photo-picker">Progress photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => void chooseFiles(event.target.files)} /><small>Up to 4 images. Large photos are compressed to presentation size before upload.</small></label>
    {previews.length > 0 && <div className="briefing-upload-previews">{previews.map((preview, index) => <img src={preview} alt={`Selected progress ${index + 1}`} key={preview} />)}</div>}
    <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Publishing…" : "Publish update"}</button></div>
  </form></Modal>;
}

async function compressProgressImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose JPG, PNG, or WebP images.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare the image.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", .82));
  if (!blob) throw new Error(`Could not prepare ${file.name}.`);
  if (blob.size > 4 * 1024 * 1024) throw new Error(`${file.name} is still too large after compression.`);
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
}

function formatBytes(value: number) {
  if (value < 1024 ** 2) return `${Math.max(0, value / 1024).toFixed(value ? 1 : 0)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}
