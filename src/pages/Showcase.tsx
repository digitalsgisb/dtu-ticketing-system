import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type PointerEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, humanize, json } from "../api";
import { CompanyLogo } from "../components/CompanyLogo";
import { ErrorNotice, Loading, PageHeader } from "../components/UI";
import { compressProgressImage } from "../progressImages";

type ShowcaseProject = {
  id: number;
  project_no: string;
  name: string;
  description: string;
  department_name: string;
  status: string;
  visible: number;
  sort_order: number;
  title_override: string | null;
  summary_override: string | null;
  detail_overview: string | null;
  problem_statement: string | null;
  solution_description: string | null;
  features_text: string | null;
  impact_statement: string | null;
  contribution: string | null;
  technologies_text: string | null;
  image_mode: "latest" | "custom" | "none";
  has_custom_image: number;
  latest_image_id: number | null;
  gallery_count: number;
};

type ShowcaseAdminData = {
  settings: { enabled: number; title: string; intro: string };
  projects: ShowcaseProject[];
  url: string;
  dataUrl: string;
};

type GuestProject = {
  id: number;
  name: string;
  summary: string;
  department: string;
  imageUrl: string | null;
  galleryCount: number;
  featureCount: number;
  highlights: string[];
};

function reorderProjects(projects: ShowcaseProject[], projectId: number, targetId: number) {
  const from = projects.findIndex(project => project.id === projectId);
  const to = projects.findIndex(project => project.id === targetId);
  if (from < 0 || to < 0 || from === to) return projects;
  const next = [...projects];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function ShowcasePage() {
  const [data, setData] = useState<ShowcaseAdminData | null>(null);
  const [orderedProjects, setOrderedProjects] = useState<ShowcaseProject[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [orderStatus, setOrderStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [projectSearch, setProjectSearch] = useState("");
  const [includedOnly, setIncludedOnly] = useState(false);
  const orderedProjectsRef = useRef<ShowcaseProject[]>([]);
  const dragStartOrder = useRef<ShowcaseProject[]>([]);
  const dragProjectId = useRef<number | null>(null);
  const load = () => api<ShowcaseAdminData>("/api/staff/showcase").then(next => {
    setData(next);
    setOrderedProjects(next.projects);
    orderedProjectsRef.current = next.projects;
    setError("");
  }).catch(e => setError(e.message));
  useEffect(() => { void load(); }, []);

  if (error && !data) return <ErrorNotice message={error} />;
  if (!data) return <Loading />;

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/staff/showcase", json("PATCH", {
        title: form.get("title"),
        intro: form.get("intro")
      }));
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const toggle = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/api/staff/showcase", json("PATCH", { enabled: !data.settings.enabled }));
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const setProjectOrder = (projects: ShowcaseProject[]) => {
    orderedProjectsRef.current = projects;
    setOrderedProjects(projects);
  };

  const moveProject = (projectId: number, targetId: number) => {
    setProjectOrder(reorderProjects(orderedProjectsRef.current, projectId, targetId));
  };

  const saveProjectOrder = async (projects: ShowcaseProject[], rollback: ShowcaseProject[]) => {
    setOrderStatus("saving");
    setError("");
    try {
      await api("/api/staff/showcase/order", json("PATCH", { projectIds: projects.map(project => project.id) }));
      setOrderStatus("saved");
      window.setTimeout(() => setOrderStatus("idle"), 1800);
    } catch (e) {
      setProjectOrder(rollback);
      setOrderStatus("idle");
      setError((e as Error).message);
    }
  };

  const beginDrag = (projectId: number, event?: DragEvent<HTMLElement>) => {
    dragProjectId.current = projectId;
    dragStartOrder.current = orderedProjectsRef.current;
    setDraggingId(projectId);
    if (event) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(projectId));
    }
  };

  const finishDrag = () => {
    if (dragProjectId.current === null) return;
    const next = orderedProjectsRef.current;
    const rollback = dragStartOrder.current;
    const changed = next.map(project => project.id).join(",") !== rollback.map(project => project.id).join(",");
    dragProjectId.current = null;
    setDraggingId(null);
    if (changed) void saveProjectOrder(next, rollback);
  };

  const pointerStart = (projectId: number, event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" || !(event.target as HTMLElement).closest(".showcase-drag-handle")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    beginDrag(projectId);
  };

  const pointerMove = (event: PointerEvent<HTMLElement>) => {
    if (dragProjectId.current === null || event.pointerType === "mouse") return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-showcase-project-id]");
    const targetId = Number(target?.dataset.showcaseProjectId);
    if (Number.isInteger(targetId)) moveProject(dragProjectId.current, targetId);
  };

  const arrangeProject = (projectId: number, destination: "top" | "up" | "down" | "bottom") => {
    const rollback = orderedProjectsRef.current;
    const included = rollback.filter(project => project.visible);
    const index = included.findIndex(project => project.id === projectId);
    if (index < 0) return;
    const targetIndex = destination === "top" ? 0 : destination === "bottom" ? included.length - 1
      : destination === "up" ? Math.max(0, index - 1) : Math.min(included.length - 1, index + 1);
    const next = reorderProjects(rollback, projectId, included[targetIndex].id);
    if (next === rollback) return;
    setProjectOrder(next);
    void saveProjectOrder(next, rollback);
  };

  const selected = orderedProjects.filter(project => project.visible).length;
  const includedProjects = orderedProjects.filter(project => project.visible);
  const search = projectSearch.trim().toLowerCase();
  const displayedProjects = orderedProjects.filter(project => (!includedOnly || project.visible) && (!search ||
    `${project.project_no} ${project.name} ${project.department_name}`.toLowerCase().includes(search)));
  return <>
    <PageHeader
      eyebrow="Visitor experience"
      title="Guest showcase"
      description="Choose what visitors can see, prepare the mobile portfolio, and control one reusable QR link."
      actions={<button className={`button ${data.settings.enabled ? "button-danger" : "button-primary"}`} disabled={busy} onClick={() => void toggle()}>
        {data.settings.enabled ? "Close visitor access" : "Open visitor access"}
      </button>}
    />
    <ErrorNotice message={error} />
    <section className={`showcase-status-panel ${data.settings.enabled ? "is-live" : ""}`}>
      <div>
        <span className="showcase-live-dot" />
        <div><strong>{data.settings.enabled ? "Visitor link is open" : "Visitor link is closed"}</strong><small>{data.settings.enabled ? "Anyone with the QR can view the approved cards." : "The same QR can be reused for your next visit."}</small></div>
      </div>
      <div><strong>{selected}</strong><small>cards selected</small></div>
    </section>

    <div className="showcase-admin-grid">
      <section className="panel showcase-settings-panel">
        <div className="panel-heading"><div><span className="eyebrow">Portfolio details</span><h2>Visitor welcome</h2></div></div>
        <form className="form-stack" onSubmit={saveSettings}>
          <label>Portfolio title<input name="title" required minLength={3} maxLength={120} defaultValue={data.settings.title} /></label>
          <label>Short introduction<textarea name="intro" required minLength={3} maxLength={500} rows={4} defaultValue={data.settings.intro} /></label>
          <button className="button button-secondary" disabled={busy}>Save welcome text</button>
        </form>
      </section>
      <section className="panel showcase-qr-panel">
        <div className="showcase-qr-copy"><span className="eyebrow">Reusable guest pass</span><h2>Scan to view</h2><p>This QR only opens the read-only portfolio. It never exposes the actual system links.</p></div>
        <img src={data.dataUrl} alt="QR code for the guest showcase" />
        <div className="showcase-url"><span>{data.url}</span><button type="button" onClick={() => {
          void navigator.clipboard.writeText(data.url).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
          });
        }}>{copied ? "Copied" : "Copy"}</button></div>
        <div className="showcase-qr-actions">
          <a className="button button-secondary" href={data.dataUrl} download="DTU-guest-showcase-QR.png">Download QR</a>
          {data.settings.enabled && <a className="button button-primary" href={data.url} target="_blank" rel="noreferrer">Preview</a>}
        </div>
      </section>
    </div>

    <section className="showcase-project-section">
      <div className="showcase-project-heading"><div><span className="eyebrow">Approved content</span><h2>Portfolio cards</h2><p>Use the quick order controls on mobile, or drag a card handle on desktop. Changes save automatically.</p></div><span>{orderStatus === "saving" ? "Saving order…" : orderStatus === "saved" ? "Order saved" : `${orderedProjects.length} available projects`}</span></div>
      {includedProjects.length > 0 && <section className="showcase-quick-order">
        <header><div><span className="eyebrow">Quick card order</span><h3>Arrange the public portfolio</h3><p>Only included cards appear here. Use the arrows to position them without dragging.</p></div><strong>{includedProjects.length} cards</strong></header>
        <div>{includedProjects.map((project, index) => <article key={project.id}>
          <span>{String(index + 1).padStart(2, "0")}</span><div><strong>{project.title_override || project.name}</strong><small>{project.project_no}</small></div>
          <nav aria-label={`Reorder ${project.name}`}>
            <button type="button" disabled={index === 0 || orderStatus === "saving"} onClick={() => arrangeProject(project.id, "top")} aria-label={`Move ${project.name} to top`} title="Move to top">⇤</button>
            <button type="button" disabled={index === 0 || orderStatus === "saving"} onClick={() => arrangeProject(project.id, "up")} aria-label={`Move ${project.name} up`} title="Move up">↑</button>
            <button type="button" disabled={index === includedProjects.length - 1 || orderStatus === "saving"} onClick={() => arrangeProject(project.id, "down")} aria-label={`Move ${project.name} down`} title="Move down">↓</button>
            <button type="button" disabled={index === includedProjects.length - 1 || orderStatus === "saving"} onClick={() => arrangeProject(project.id, "bottom")} aria-label={`Move ${project.name} to bottom`} title="Move to bottom">⇥</button>
          </nav>
        </article>)}</div>
      </section>}
      <div className="showcase-project-tools">
        <label><span>Find a system</span><input type="search" value={projectSearch} placeholder="Search name, number, or department" onChange={event => setProjectSearch(event.target.value)} /></label>
        <button type="button" className={includedOnly ? "active" : ""} onClick={() => setIncludedOnly(value => !value)}>{includedOnly ? "Showing included" : "Show included only"}</button>
        <span>{displayedProjects.length} shown</span>
      </div>
      <div className="showcase-editor-list">
        {displayedProjects.map(project => <div
          className={`showcase-editor-dropzone ${draggingId === project.id ? "is-dragging" : ""}`}
          key={project.id}
          data-showcase-project-id={project.id}
          onDragStart={event => beginDrag(project.id, event)}
          onDragEnter={event => {
            event.preventDefault();
            if (dragProjectId.current !== null) moveProject(dragProjectId.current, project.id);
          }}
          onDragOver={event => event.preventDefault()}
          onDrop={event => { event.preventDefault(); finishDrag(); }}
          onDragEnd={finishDrag}
          onPointerDown={event => pointerStart(project.id, event)}
          onPointerMove={pointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <ShowcaseProjectEditor project={project} position={orderedProjects.findIndex(item => item.id === project.id)} dragging={draggingId === project.id} onSaved={load} />
        </div>)}
        {!displayedProjects.length && <div className="showcase-project-empty">No systems match this view.</div>}
      </div>
    </section>
  </>;
}

function ShowcaseProjectEditor({ project, position, dragging, onSaved }: { project: ShowcaseProject; position: number; dragging: boolean; onSaved: () => void }) {
  const [visible, setVisible] = useState(Boolean(project.visible));
  const [title, setTitle] = useState(project.title_override ?? "");
  const [summary, setSummary] = useState(project.summary_override ?? "");
  const [overview, setOverview] = useState(project.detail_overview ?? "");
  const [problem, setProblem] = useState(project.problem_statement ?? "");
  const [solution, setSolution] = useState(project.solution_description ?? "");
  const [features, setFeatures] = useState(project.features_text ?? "");
  const [impact, setImpact] = useState(project.impact_statement ?? "");
  const [contribution, setContribution] = useState(project.contribution ?? "");
  const [technologies, setTechnologies] = useState(project.technologies_text ?? "");
  const [caseOpen, setCaseOpen] = useState(false);
  const [imageMode, setImageMode] = useState(project.image_mode);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const preview = useMemo(() => file ? URL.createObjectURL(file)
    : imageMode === "custom" && project.has_custom_image ? `/api/staff/showcase/projects/${project.id}/image`
      : imageMode === "latest" && project.latest_image_id ? `/api/staff/projects/progress-images/${project.latest_image_id}`
        : "", [file, imageMode, project]);
  useEffect(() => () => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    setVisible(Boolean(project.visible));
    setTitle(project.title_override ?? "");
    setSummary(project.summary_override ?? "");
    setOverview(project.detail_overview ?? "");
    setProblem(project.problem_statement ?? "");
    setSolution(project.solution_description ?? "");
    setFeatures(project.features_text ?? "");
    setImpact(project.impact_statement ?? "");
    setContribution(project.contribution ?? "");
    setTechnologies(project.technologies_text ?? "");
    setImageMode(project.image_mode);
  }, [project]);

  const save = async () => {
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      const body = new FormData();
      body.set("visible", String(visible));
      body.set("sortOrder", String(position));
      body.set("title", title);
      body.set("summary", summary);
      body.set("overview", overview);
      body.set("problem", problem);
      body.set("solution", solution);
      body.set("features", features);
      body.set("impact", impact);
      body.set("contribution", contribution);
      body.set("technologies", technologies);
      body.set("imageMode", imageMode);
      if (file) body.set("image", await compressProgressImage(file));
      await api(`/api/staff/showcase/projects/${project.id}`, { method: "PATCH", body });
      setSaved(true);
      setFile(null);
      onSaved();
      window.setTimeout(() => setSaved(false), 1600);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return <article className={`showcase-editor ${visible ? "is-selected" : ""} ${dragging ? "is-dragging" : ""}`}>
    <div className="showcase-editor-cover">
      {preview ? <img src={preview} alt="" /> : <div><strong>{project.project_no}</strong><span>Text-only card</span></div>}
      <label className="showcase-include"><input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} /><span>{visible ? "Included" : "Include"}</span></label>
    </div>
    <div className="showcase-editor-fields">
      <header>
        <button className="showcase-drag-handle" type="button" draggable aria-label={`Drag ${project.name} to reorder`} title="Drag to reorder"><i /><i /><i /><i /><i /><i /><span>{String(position + 1).padStart(2, "0")}</span></button>
        <div><span>{project.project_no} · {project.department_name}</span><h3>{project.name}</h3></div>
        <small>{humanize(project.status)}</small>
      </header>
      <div className="showcase-editor-form">
        <label className="showcase-title-field">Visitor title <small>optional</small><input value={title} maxLength={120} placeholder={project.name} onChange={e => setTitle(e.target.value)} /></label>
        <label className="showcase-summary-field">Visitor summary <small>optional</small><textarea rows={3} maxLength={800} value={summary} placeholder={project.description || "Add a short, visitor-friendly description"} onChange={e => setSummary(e.target.value)} /></label>
        <label>Cover style<select value={imageMode} onChange={e => setImageMode(e.target.value as typeof imageMode)}>
          <option value="latest">Latest progress photo</option>
          <option value="custom">Custom cover photo</option>
          <option value="none">No photo</option>
        </select></label>
        <label>Upload custom cover <small>16:9 · 1600 × 900 px · transparent PNG supported</small><input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={e => {
          const next = e.target.files?.[0] ?? null;
          setFile(next);
          if (next) setImageMode("custom");
        }} /></label>
      </div>
      <footer><ErrorNotice message={error} /><button className="button button-secondary" type="button" onClick={() => setCaseOpen(open => !open)}>{caseOpen ? "Close case study" : `Edit case study · ${project.gallery_count || 0} images`}</button><button className="button button-secondary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : saved ? "Saved" : "Save card"}</button></footer>
    </div>
    {caseOpen && <section className="showcase-case-editor">
      <header><div><span className="eyebrow">Professional case study</span><h3>Tell the story behind the system</h3><p>These fields appear only in the approved public portfolio. Actual system links remain private.</p></div><button className="button button-primary" disabled={busy} onClick={() => void save()}>Save case study</button></header>
      <div className="showcase-case-fields">
        <label>Overview<textarea rows={4} maxLength={4000} value={overview} placeholder="What is this system and who is it for?" onChange={event => setOverview(event.target.value)} /></label>
        <label>The challenge<textarea rows={4} maxLength={3000} value={problem} placeholder="What problem or manual process needed to be improved?" onChange={event => setProblem(event.target.value)} /></label>
        <label>The solution<textarea rows={4} maxLength={4000} value={solution} placeholder="How does the system solve that problem?" onChange={event => setSolution(event.target.value)} /></label>
        <label>What the system does <small>one feature per line</small><textarea rows={6} maxLength={4000} value={features} placeholder={'Live production status\nAutomated alerts\nManagement reporting'} onChange={event => setFeatures(event.target.value)} /></label>
        <label>Impact and outcome<textarea rows={4} maxLength={3000} value={impact} placeholder="Time saved, visibility improved, errors reduced, or another measurable outcome." onChange={event => setImpact(event.target.value)} /></label>
        <label>Your contribution <small>useful for interview sharing</small><textarea rows={4} maxLength={2000} value={contribution} placeholder="Your role in discovery, design, development, deployment, or support." onChange={event => setContribution(event.target.value)} /></label>
        <label className="showcase-case-wide">Technologies <small>separate with commas</small><input maxLength={1200} value={technologies} placeholder="React, Node.js, SQLite, Raspberry Pi" onChange={event => setTechnologies(event.target.value)} /></label>
      </div>
      <ShowcaseGalleryManager projectId={project.id} />
    </section>}
  </article>;
}

type GalleryItem = { id: number; caption: string; original_name: string; imageUrl: string; source_image_id: number | null };
type ProgressGalleryImage = { id: number; original_name: string; created_at: string; gallery_id: number | null; imageUrl: string };

function ShowcaseGalleryManager({ projectId }: { projectId: number }) {
  const [data, setData] = useState<{ gallery: GalleryItem[]; progressImages: ProgressGalleryImage[]; maximum: number } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = () => api(`/api/staff/showcase/projects/${projectId}/gallery`).then(setData).catch(e => setError(e.message));
  useEffect(() => { void load(); }, [projectId]);

  const upload = async () => {
    if (!files.length) return;
    setBusy(true); setError("");
    try {
      const body = new FormData();
      for (const file of files) body.append("images", await compressProgressImage(file));
      await api(`/api/staff/showcase/projects/${projectId}/gallery/upload`, { method: "POST", body });
      setFiles([]);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const addProgress = async (image: ProgressGalleryImage) => {
    setBusy(true); setError("");
    try {
      await api(`/api/staff/showcase/projects/${projectId}/gallery/progress`, json("POST", { sourceImageId: image.id, caption: image.original_name.replace(/\.[^.]+$/, "") }));
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const remove = async (id: number) => {
    setBusy(true); setError("");
    try { await api(`/api/staff/showcase/gallery/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  if (!data) return <div className="showcase-gallery-loading"><Loading /></div>;
  return <div className="showcase-gallery-manager">
    <header><div><span className="eyebrow">Approved image gallery</span><h3>Show the system from more angles</h3><p>{data.gallery.length} of {data.maximum} images selected. Only images shown here become public.</p></div></header>
    <ErrorNotice message={error} />
    {data.gallery.length > 0 && <div className="showcase-gallery-selected">{data.gallery.map(item => <GalleryEditorItem key={item.id} item={item} busy={busy} onRemoved={() => void remove(item.id)} onChanged={load} />)}</div>}
    <div className="showcase-gallery-add">
      <label>Upload portfolio screenshots<input type="file" accept=".jpg,.jpeg,.png,.webp" multiple onChange={event => setFiles(Array.from(event.target.files ?? []).slice(0, 8))} /></label>
      <button className="button button-primary" type="button" disabled={busy || !files.length} onClick={() => void upload()}>{busy ? "Adding…" : `Add ${files.length || ""} image${files.length === 1 ? "" : "s"}`}</button>
    </div>
    {data.progressImages.length > 0 && <div className="showcase-progress-library"><h4>Reuse progress update photos</h4><div>{data.progressImages.map(image => <article key={image.id} className={image.gallery_id ? "is-added" : ""}><img src={image.imageUrl} alt="" /><span>{image.original_name}</span><button type="button" disabled={busy || Boolean(image.gallery_id)} onClick={() => void addProgress(image)}>{image.gallery_id ? "Added" : "Add"}</button></article>)}</div></div>}
  </div>;
}

function GalleryEditorItem({ item, busy, onRemoved, onChanged }: { item: GalleryItem; busy: boolean; onRemoved: () => void; onChanged: () => void }) {
  const [caption, setCaption] = useState(item.caption);
  const [saving, setSaving] = useState(false);
  const saveCaption = async () => {
    setSaving(true);
    try { await api(`/api/staff/showcase/gallery/${item.id}`, json("PATCH", { caption })); onChanged(); }
    finally { setSaving(false); }
  };
  return <article><img src={item.imageUrl} alt="" /><div><input value={caption} maxLength={180} aria-label="Image caption" onChange={event => setCaption(event.target.value)} /><span>{item.original_name}</span></div><button type="button" disabled={busy || saving} onClick={() => void saveCaption()}>{saving ? "Saving…" : "Save caption"}</button><button type="button" className="is-remove" disabled={busy} onClick={onRemoved}>Remove</button></article>;
}

export function PublicShowcasePage() {
  const { token } = useParams();
  const [data, setData] = useState<{ title: string; intro: string; projects: GuestProject[] } | null>(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const [openProjectId, setOpenProjectId] = useState<number | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const load = () => void api(`/api/public/showcase/${token}`).then(next => {
      setData(next);
      setError("");
    }).catch(e => setError(e.message));
    load();
    const interval = window.setInterval(load, 30_000);
    return () => window.clearInterval(interval);
  }, [token]);

  const move = (index: number) => {
    const cards = rail.current?.querySelectorAll<HTMLElement>(".guest-showcase-card");
    cards?.[Math.max(0, Math.min(index, cards.length - 1))]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  if (error) return <div className="guest-showcase guest-showcase-closed"><CompanyLogo /><div><span>Guest showcase</span><h1>Thanks for visiting.</h1><p>{error}</p></div></div>;
  if (!data) return <div className="guest-showcase"><Loading /></div>;
  const totalSlides = data.projects.length + 1;
  return <main className="guest-showcase">
    <header className="guest-showcase-header"><Link to={`/showcase/${token}`}><CompanyLogo /></Link><span>DTU · Digital solutions</span></header>
    <section className="guest-showcase-intro"><span className="eyebrow">Made for the way we work</span><h1>{data.title}</h1><p>{data.intro}</p><div><strong>{String(data.projects.length).padStart(2, "0")}</strong><span>systems<br />in this showcase</span></div></section>
    {data.projects.length ? <>
      <div className="guest-showcase-rail" ref={rail} onScroll={event => {
        const element = event.currentTarget;
        const cards = Array.from(element.querySelectorAll<HTMLElement>(".guest-showcase-card"));
        const centre = element.scrollLeft + element.clientWidth / 2;
        const next = cards.reduce((best, card, index) =>
          Math.abs(card.offsetLeft + card.offsetWidth / 2 - centre) < Math.abs(cards[best].offsetLeft + cards[best].offsetWidth / 2 - centre) ? index : best, 0);
        setActive(next);
      }}>
        {data.projects.map((project, index) => <button type="button" className="guest-showcase-card" key={project.id} aria-haspopup="dialog" aria-label={`Open ${project.name} project details`} onClick={() => setOpenProjectId(project.id)}>
          <div className={`guest-showcase-image ${project.imageUrl ? "" : "is-empty"}`}>
            {project.imageUrl ? <>
              <img className="guest-showcase-image-backdrop" src={project.imageUrl} alt="" aria-hidden="true" />
              <img className="guest-showcase-image-foreground" src={project.imageUrl} alt={`Preview of ${project.name}`} />
            </> : <div><span>{String(index + 1).padStart(2, "0")}</span><strong>DTU</strong></div>}
            <span className="guest-card-count">{String(index + 1).padStart(2, "0")} / {String(data.projects.length).padStart(2, "0")}</span>
            <span className="guest-card-open-mark" aria-hidden="true">↗</span>
          </div>
          <div className="guest-showcase-copy"><span>{project.department}</span><h2>{project.name}</h2><p>{project.summary || "A focused digital solution created around the team's day-to-day work."}</p>{project.highlights?.length > 0 && <ul>{project.highlights.map(highlight => <li key={highlight}>{highlight}</li>)}</ul>}</div>
        </button>)}
        <article className="guest-showcase-card guest-showcase-more">
          <div className="guest-showcase-more-art" aria-hidden="true"><span>+</span><i /><i /><i /></div>
          <div className="guest-showcase-copy"><span>Beyond this showcase</span><h2>And many more.</h2><p>More digital tools, improvements, and ideas continue to be designed for the way our teams work.</p></div>
        </article>
      </div>
      <nav className="guest-showcase-controls" aria-label="Showcase navigation">
        <button aria-label="Previous system" disabled={active === 0} onClick={() => move(active - 1)}>←</button>
        <div>{data.projects.map((project, index) => <button key={project.id} className={index === active ? "active" : ""} aria-label={`View ${project.name}`} onClick={() => move(index)} />)}<button className={active === totalSlides - 1 ? "active" : ""} aria-label="View more systems" onClick={() => move(totalSlides - 1)} /></div>
        <button aria-label="Next system" disabled={active === totalSlides - 1} onClick={() => move(active + 1)}>→</button>
      </nav>
      <p className="guest-showcase-hint">Swipe to explore</p>
    </> : <section className="guest-showcase-empty"><span>Portfolio ready</span><h2>Projects will appear here shortly.</h2></section>}
    <footer className="guest-showcase-footer"><CompanyLogo /></footer>
    {openProjectId && <PortfolioCaseModal token={token || ""} projectId={openProjectId} onClose={() => setOpenProjectId(null)} />}
  </main>;
}

type PortfolioCaseData = {
  portfolioTitle: string;
  project: {
    id: number; name: string; summary: string; department: string; overview: string;
    problem: string; solution: string; features: string[]; impact: string;
    contribution: string; technologies: string[]; coverImageUrl: string | null;
  };
  gallery: { id: number; caption: string; imageUrl: string }[];
  previous: { id: number; name: string } | null;
  next: { id: number; name: string } | null;
};

function PortfolioCaseContent({ data, token, inModal = false, onNavigate }: { data: PortfolioCaseData; token: string; inModal?: boolean; onNavigate?: (id: number) => void }) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const { project } = data;
  const sectionPrefix = inModal ? `popup-${project.id}` : `case-${project.id}`;
  const images = [
    ...(project.coverImageUrl ? [{ id: 0, caption: `${project.name} overview`, imageUrl: project.coverImageUrl }] : []),
    ...data.gallery
  ];
  const currentImage = images[Math.min(selectedImage, Math.max(0, images.length - 1))];

  useEffect(() => { setSelectedImage(0); setLightbox(false); }, [project.id]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && lightbox) setLightbox(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [lightbox]);

  const projectLink = (item: { id: number; name: string }, direction: "previous" | "next") => onNavigate
    ? <button type="button" onClick={() => onNavigate(item.id)}><span>{direction === "previous" ? "← Previous project" : "Next project →"}</span><strong>{item.name}</strong></button>
    : <Link to={`/showcase/${token}/projects/${item.id}`}><span>{direction === "previous" ? "← Previous project" : "Next project →"}</span><strong>{item.name}</strong></Link>;

  return <div className={`portfolio-case-content ${inModal ? "is-modal" : ""}`}>
    <section className="portfolio-case-hero">
      <div><span className="eyebrow">{project.department} · Case study</span><h1>{project.name}</h1><p>{project.summary}</p><div className="portfolio-case-stats"><span><strong>{String(project.features.length).padStart(2, "0")}</strong> key functions</span><span><strong>{String(images.length).padStart(2, "0")}</strong> project images</span></div></div>
      {project.coverImageUrl && <button className="portfolio-case-cover" type="button" onClick={() => { setSelectedImage(0); setLightbox(true); }}><img src={project.coverImageUrl} alt={`Overview of ${project.name}`} /><span>View full image</span></button>}
    </section>
    <nav className="portfolio-case-nav" aria-label="Case study sections"><a href={`#${sectionPrefix}-overview`}>Overview</a>{project.features.length > 0 && <a href={`#${sectionPrefix}-capabilities`}>What it does</a>}{images.length > 0 && <a href={`#${sectionPrefix}-gallery`}>Gallery</a>}{project.impact && <a href={`#${sectionPrefix}-impact`}>Impact</a>}</nav>
    <div className="portfolio-case-body">
      <section id={`${sectionPrefix}-overview`} className="portfolio-story-grid">
        <article className="portfolio-story-overview"><span>01 · Overview</span><h2>Built around the work, not around the software.</h2><p>{project.overview || project.summary}</p></article>
        {project.problem && <article><span>The challenge</span><h3>What needed to change</h3><p>{project.problem}</p></article>}
        <article><span>The solution</span><h3>How the system responds</h3><p>{project.solution || project.summary}</p></article>
      </section>
      {project.features.length > 0 && <section id={`${sectionPrefix}-capabilities`} className="portfolio-capabilities"><header><span className="eyebrow">02 · What it does</span><h2>Core system functions</h2><p>A practical look at the functions designed for day-to-day users.</p></header><div>{project.features.map((feature, index) => <article key={`${feature}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><h3>{feature}</h3><i /></article>)}</div></section>}
      {images.length > 0 && currentImage && <section id={`${sectionPrefix}-gallery`} className="portfolio-gallery"><header><span className="eyebrow">03 · Product gallery</span><h2>See the system in action</h2><p>Explore approved screens, workflows, and delivery progress.</p></header><div className="portfolio-gallery-stage"><button type="button" onClick={() => setLightbox(true)}><img src={currentImage.imageUrl} alt={currentImage.caption || project.name} /></button><footer><span>{currentImage.caption || project.name}</span><strong>{String(selectedImage + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}</strong></footer></div>{images.length > 1 && <div className="portfolio-gallery-thumbs">{images.map((image, index) => <button key={`${image.id}-${index}`} className={selectedImage === index ? "active" : ""} type="button" onClick={() => setSelectedImage(index)}><img src={image.imageUrl} alt="" /><span>{String(index + 1).padStart(2, "0")}</span></button>)}</div>}</section>}
      {(project.impact || project.contribution) && <section id={`${sectionPrefix}-impact`} className="portfolio-impact">
        {project.impact && <article><span className="eyebrow">04 · Outcome</span><h2>Impact on the work</h2><p>{project.impact}</p></article>}
        {project.contribution && <article><span className="eyebrow">Contribution</span><h2>Role in the delivery</h2><p>{project.contribution}</p></article>}
      </section>}
      {project.technologies.length > 0 && <section className="portfolio-technologies"><span>Built with</span><div>{project.technologies.map(item => <b key={item}>{item}</b>)}</div></section>}
    </div>
    <nav className="portfolio-project-nav">{data.previous ? projectLink(data.previous, "previous") : <i />}{data.next ? projectLink(data.next, "next") : <i />}</nav>
    {lightbox && currentImage && <div className="portfolio-lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(false)}><button type="button" aria-label="Close image">×</button><img onClick={event => event.stopPropagation()} src={currentImage.imageUrl} alt={currentImage.caption || project.name} /><footer onClick={event => event.stopPropagation()}><span>{currentImage.caption || project.name}</span><strong>{selectedImage + 1} / {images.length}</strong></footer></div>}
  </div>;
}

function PortfolioCaseModal({ token, projectId, onClose }: { token: string; projectId: number; onClose: () => void }) {
  const [activeProjectId, setActiveProjectId] = useState(projectId);
  const [data, setData] = useState<PortfolioCaseData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { setActiveProjectId(projectId); }, [projectId]);
  useEffect(() => {
    let current = true;
    setData(null); setError("");
    void api(`/api/public/showcase/${token}/projects/${activeProjectId}`).then(next => { if (current) setData(next); }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [token, activeProjectId]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".portfolio-lightbox")) onClose();
    };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", close); };
  }, [onClose]);

  return <div className="portfolio-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="portfolio-modal" role="dialog" aria-modal="true" aria-label={data ? `${data.project.name} project details` : "Project details"} onMouseDown={event => event.stopPropagation()}>
      <header className="portfolio-modal-header"><CompanyLogo /><span>{data?.portfolioTitle || "Project portfolio"}</span><button type="button" onClick={onClose} aria-label="Close project details">×</button></header>
      {error && <div className="portfolio-modal-message"><span>Project details</span><h2>Unable to open this project.</h2><p>{error}</p></div>}
      {!data && !error && <div className="portfolio-modal-loading"><Loading /></div>}
      {data && <PortfolioCaseContent data={data} token={token} inModal onNavigate={setActiveProjectId} />}
    </section>
  </div>;
}

export function PublicShowcaseDetailPage() {
  const { token = "", projectId = "" } = useParams();
  const [data, setData] = useState<PortfolioCaseData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setData(null); setError("");
    window.scrollTo({ top: 0, behavior: "auto" });
    void api(`/api/public/showcase/${token}/projects/${projectId}`).then(setData).catch(e => setError(e.message));
  }, [token, projectId]);

  if (error) return <div className="guest-showcase guest-showcase-closed"><CompanyLogo /><div><span>Portfolio case study</span><h1>Unable to open this project.</h1><p>{error}</p><Link className="guest-showcase-explore" to={`/showcase/${token}`}>Back to portfolio</Link></div></div>;
  if (!data) return <div className="guest-showcase"><Loading /></div>;
  return <main className="guest-showcase portfolio-case-page">
    <header className="guest-showcase-header portfolio-case-header"><Link to={`/showcase/${token}`}><CompanyLogo /></Link><Link to={`/showcase/${token}`}>← All projects</Link></header>
    <PortfolioCaseContent data={data} token={token} />
    <footer className="guest-showcase-footer"><CompanyLogo /></footer>
  </main>;
}
