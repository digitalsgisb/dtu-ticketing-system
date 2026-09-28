import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type PointerEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, humanize, json } from "../api";
import { CompanyLogo } from "../components/CompanyLogo";
import { ErrorNotice, Loading, PageHeader } from "../components/UI";
import { compressProgressImage } from "../progressImages";
import { useLiveRefresh } from "../live";

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
  category: string;
  detail_overview: string | null;
  story_eyebrow: string | null;
  story_title: string | null;
  overview_label: string | null;
  challenge_label: string | null;
  solution_label: string | null;
  functions_label: string | null;
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
  settings: { enabled: number; title: string; intro: string; pc_eyebrow: string; show_pdf_export: number };
  projects: ShowcaseProject[];
  url: string;
  dataUrl: string;
};

type GuestProject = {
  id: number;
  name: string;
  summary: string;
  department: string;
  category: string;
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
  useLiveRefresh(load);

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
        intro: form.get("intro"),
        pcEyebrow: form.get("pcEyebrow")
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

  const togglePdfExport = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/api/staff/showcase", json("PATCH", { showPdfExport: !data.settings.show_pdf_export }));
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
      description="Choose what visitors can see, prepare the mobile and PC views, and control one reusable QR link."
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
          <label>PC presentation eyebrow<input name="pcEyebrow" maxLength={80} defaultValue={data.settings.pc_eyebrow} placeholder="DTU · Digital solutions" /></label>
          <label>Portfolio title<input name="title" required minLength={3} maxLength={120} defaultValue={data.settings.title} /></label>
          <label>Portfolio subtitle / introduction<textarea name="intro" required minLength={3} maxLength={500} rows={4} defaultValue={data.settings.intro} /></label>
          <button className="button button-secondary" disabled={busy}>Save welcome text</button>
        </form>
        <div className="showcase-pdf-setting"><div><strong>PDF export button</strong><small>{data.settings.show_pdf_export ? "Visible to showcase visitors" : "Hidden from showcase visitors"}</small></div><button type="button" className="button button-secondary" disabled={busy} onClick={() => void togglePdfExport()}>{data.settings.show_pdf_export ? "Hide button" : "Show button"}</button></div>
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
      <div className="showcase-project-heading"><div><span className="eyebrow">Approved content</span><h2>Portfolio cards</h2><p>Set a presentation category on each card, then place related projects together. Use the quick order controls or drag to arrange them.</p></div><span>{orderStatus === "saving" ? "Saving order…" : orderStatus === "saved" ? "Order saved" : `${orderedProjects.length} available projects`}</span></div>
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
  const [category, setCategory] = useState(project.category ?? "");
  const [overview, setOverview] = useState(project.detail_overview ?? "");
  const [storyEyebrow, setStoryEyebrow] = useState(project.story_eyebrow ?? "");
  const [storyTitle, setStoryTitle] = useState(project.story_title ?? "");
  const [overviewLabel, setOverviewLabel] = useState(project.overview_label ?? "");
  const [challengeLabel, setChallengeLabel] = useState(project.challenge_label ?? "");
  const [solutionLabel, setSolutionLabel] = useState(project.solution_label ?? "");
  const [functionsLabel, setFunctionsLabel] = useState(project.functions_label ?? "");
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
    setCategory(project.category ?? "");
    setOverview(project.detail_overview ?? "");
    setStoryEyebrow(project.story_eyebrow ?? "");
    setStoryTitle(project.story_title ?? "");
    setOverviewLabel(project.overview_label ?? "");
    setChallengeLabel(project.challenge_label ?? "");
    setSolutionLabel(project.solution_label ?? "");
    setFunctionsLabel(project.functions_label ?? "");
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
      body.set("category", category);
      body.set("overview", overview);
      body.set("storyEyebrow", storyEyebrow);
      body.set("storyTitle", storyTitle);
      body.set("overviewLabel", overviewLabel);
      body.set("challengeLabel", challengeLabel);
      body.set("solutionLabel", solutionLabel);
      body.set("functionsLabel", functionsLabel);
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
        <label className="showcase-title-field">Presentation category <small>projects with the same category appear under a shared heading</small><input value={category} maxLength={80} placeholder="e.g. Operations, Analytics, Customer experience" onChange={e => setCategory(e.target.value)} /></label>
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
        <label>Case study small heading<input maxLength={100} value={storyEyebrow} placeholder={`${title || project.name} · Case study`} onChange={event => setStoryEyebrow(event.target.value)} /></label>
        <label>Case study main heading<input maxLength={120} value={storyTitle} placeholder="From challenge to solution" onChange={event => setStoryTitle(event.target.value)} /></label>
        <label>First card heading<input maxLength={80} value={overviewLabel} placeholder="Overview" onChange={event => setOverviewLabel(event.target.value)} /></label>
        <label>Second card heading<input maxLength={80} value={challengeLabel} placeholder="Challenge" onChange={event => setChallengeLabel(event.target.value)} /></label>
        <label>Third card heading<input maxLength={80} value={solutionLabel} placeholder="Solution" onChange={event => setSolutionLabel(event.target.value)} /></label>
        <label>Functions row heading<input maxLength={80} value={functionsLabel} placeholder="Key functions" onChange={event => setFunctionsLabel(event.target.value)} /></label>
        <label>Overview<textarea rows={4} maxLength={4000} value={overview} placeholder="What is this system and who is it for?" onChange={event => setOverview(event.target.value)} /></label>
        <label>The challenge<textarea rows={4} maxLength={3000} value={problem} placeholder="What problem or manual process needed to be improved?" onChange={event => setProblem(event.target.value)} /></label>
        <label>The solution<textarea rows={4} maxLength={4000} value={solution} placeholder="How does the system solve that problem?" onChange={event => setSolution(event.target.value)} /></label>
        <label>What the system does <small>one feature per line</small><textarea rows={6} maxLength={4000} value={features} placeholder={'Live production status\nAutomated alerts\nManagement reporting'} onChange={event => setFeatures(event.target.value)} /></label>
        <label>Impact and outcome<textarea rows={4} maxLength={3000} value={impact} placeholder="Time saved, visibility improved, errors reduced, or another measurable outcome." onChange={event => setImpact(event.target.value)} /></label>
        <label>Your contribution <small>useful for interview sharing</small><textarea rows={4} maxLength={2000} value={contribution} placeholder="Your role in discovery, design, development, deployment, or support." onChange={event => setContribution(event.target.value)} /></label>
        <label className="showcase-case-wide">Technologies <small>separate with commas</small><input maxLength={1200} value={technologies} placeholder="React, Node.js, SQLite, Raspberry Pi" onChange={event => setTechnologies(event.target.value)} /></label>
      </div>
      <StoryImageManager projectId={project.id} />
      <ShowcaseGalleryManager projectId={project.id} />
    </section>}
  </article>;
}

type GalleryItem = { id: number; caption: string; original_name: string; imageUrl: string; source_image_id: number | null };
type ProgressGalleryImage = { id: number; original_name: string; created_at: string; gallery_id: number | null; imageUrl: string };
type StorySlot = "overview" | "challenge" | "solution";
type StoryImage = { name: string; url: string };

function StoryImageManager({ projectId }: { projectId: number }) {
  const [images, setImages] = useState<Partial<Record<StorySlot, StoryImage>>>({});
  const [busySlot, setBusySlot] = useState<StorySlot | null>(null);
  const [error, setError] = useState("");
  const load = () => api<{ images: Partial<Record<StorySlot, StoryImage>> }>(`/api/staff/showcase/projects/${projectId}/story-images`)
    .then(next => { setImages(next.images); setError(""); }).catch(cause => setError((cause as Error).message));
  useEffect(() => { void load(); }, [projectId]);

  const upload = async (slot: StorySlot, file: File) => {
    setBusySlot(slot); setError("");
    try {
      const body = new FormData();
      body.set("image", await compressProgressImage(file));
      await api(`/api/staff/showcase/projects/${projectId}/story-images/${slot}`, { method: "POST", body });
      await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusySlot(null); }
  };

  const remove = async (slot: StorySlot) => {
    setBusySlot(slot); setError("");
    try {
      await api(`/api/staff/showcase/projects/${projectId}/story-images/${slot}`, { method: "DELETE" });
      await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusySlot(null); }
  };

  const slots: { key: StorySlot; label: string }[] = [
    { key: "overview", label: "First card image" },
    { key: "challenge", label: "Second card image" },
    { key: "solution", label: "Third card image" }
  ];
  return <section className="showcase-story-image-manager"><header><span className="eyebrow">Case study slide images</span><h4>Give each card its own picture</h4><p>Optional JPG, PNG, or WebP. Images upload when selected, and appear beneath the card text.</p></header><ErrorNotice message={error} /><div>{slots.map(slot => <article key={slot.key}>{images[slot.key] ? <img src={images[slot.key]?.url} alt={`${slot.label} preview`} /> : <div className="showcase-story-image-placeholder">No image</div>}<strong>{slot.label}</strong>{images[slot.key] && <small>{images[slot.key]?.name}</small>}<label className="button button-secondary">{busySlot === slot.key ? "Working…" : images[slot.key] ? "Replace image" : "Upload image"}<input type="file" accept=".jpg,.jpeg,.png,.webp" disabled={busySlot !== null} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(slot.key, file); event.target.value = ""; }} /></label>{images[slot.key] && <button className="button button-secondary" type="button" disabled={busySlot !== null} onClick={() => void remove(slot.key)}>Remove image</button>}</article>)}</div></section>;
}

function ShowcaseGalleryManager({ projectId }: { projectId: number }) {
  const [data, setData] = useState<{ gallery: GalleryItem[]; progressImages: ProgressGalleryImage[]; maximum: number } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = () => api(`/api/staff/showcase/projects/${projectId}/gallery`).then(setData).catch(e => setError(e.message));
  useEffect(() => { void load(); }, [projectId]);
  useLiveRefresh(load);

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
  const [data, setData] = useState<{ title: string; intro: string; pcEyebrow: string; showPdfExport: boolean; projects: GuestProject[] } | null>(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const [view, setView] = useState<"mobile" | "pc">(() => window.matchMedia("(min-width: 850px)").matches ? "pc" : "mobile");
  const [fullscreen, setFullscreen] = useState(false);
  const [openProjectId, setOpenProjectId] = useState<number | null>(null);
  const showcaseRoot = useRef<HTMLElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const activeRef = useRef(0);
  const lastInteraction = useRef(Date.now());
  const load = () => api(`/api/public/showcase/${token}`).then(next => {
    setData(next);
    setError("");
  }).catch(e => setError(e.message));
  useEffect(() => {
    void load();
  }, [token]);
  useLiveRefresh(load, "/api/public/live");

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === showcaseRoot.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await showcaseRoot.current?.requestFullscreen();
    } catch { setError("Fullscreen is unavailable in this browser."); }
  };

  const move = (index: number) => {
    const element = rail.current;
    const cards = element?.querySelectorAll<HTMLElement>(".guest-showcase-card");
    const card = cards?.[Math.max(0, Math.min(index, cards.length - 1))];
    if (!element || !card) return;
    element.scrollTo({ left: card.offsetLeft - (element.clientWidth - card.offsetWidth) / 2, behavior: "smooth" });
  };

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => {
    const recordInteraction = () => { lastInteraction.current = Date.now(); };
    const passive = { passive: true } as AddEventListenerOptions;
    window.addEventListener("pointerdown", recordInteraction, passive);
    window.addEventListener("touchstart", recordInteraction, passive);
    window.addEventListener("wheel", recordInteraction, passive);
    window.addEventListener("scroll", recordInteraction, passive);
    window.addEventListener("keydown", recordInteraction);
    return () => {
      window.removeEventListener("pointerdown", recordInteraction);
      window.removeEventListener("touchstart", recordInteraction);
      window.removeEventListener("wheel", recordInteraction);
      window.removeEventListener("scroll", recordInteraction);
      window.removeEventListener("keydown", recordInteraction);
    };
  }, []);
  useEffect(() => {
    if (!data?.projects.length || openProjectId !== null || view !== "mobile") return;
    lastInteraction.current = Date.now();
    const interval = window.setInterval(() => {
      if (document.hidden || Date.now() - lastInteraction.current < 10_000) return;
      const total = data.projects.length + 1;
      const next = (activeRef.current + 1) % total;
      activeRef.current = next;
      move(next);
      lastInteraction.current = Date.now();
    }, 500);
    return () => window.clearInterval(interval);
  }, [data?.projects.length, openProjectId, view]);

  useEffect(() => {
    if (view !== "pc" || openProjectId !== null) return;
    const navigate = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowDown") setActive(index => Math.min(index + 1, Math.max(0, (data?.projects.length || 1) - 1)));
      if (event.key === "ArrowUp") setActive(index => Math.max(index - 1, 0));
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [view, openProjectId, data?.projects.length]);

  if (error) return <div className="guest-showcase guest-showcase-closed"><CompanyLogo /><div><span>Guest showcase</span><h1>Thanks for visiting.</h1><p>{error}</p></div></div>;
  if (!data) return <div className="guest-showcase"><Loading /></div>;
  const totalSlides = data.projects.length + 1;
  const selectedProject = data.projects[Math.min(active, data.projects.length - 1)];
  return <main className={`guest-showcase guest-showcase-${view}`} ref={showcaseRoot}>
    <header className="guest-showcase-header"><Link to={`/showcase/${token}`}><CompanyLogo /></Link><div className="guest-showcase-toolbar"><div className="guest-view-switch" role="group" aria-label="Showcase view"><button type="button" className={view === "mobile" ? "active" : ""} aria-pressed={view === "mobile"} onClick={() => { setView("mobile"); setActive(0); }}>Mobile view</button><button type="button" className={view === "pc" ? "active" : ""} aria-pressed={view === "pc"} onClick={() => { setView("pc"); setActive(0); }}>PC view</button></div><button className="guest-fullscreen-button" type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? "Exit fullscreen" : "⛶ Fullscreen"}</button></div></header>
    {view === "pc" ? <section className="guest-pc-presentation">
      <div className="guest-pc-heading"><span className="eyebrow">{data.pcEyebrow}</span><h1>{data.title}</h1><p>{data.intro}</p></div>
      {selectedProject ? <div className="guest-pc-layout"><nav className="guest-pc-projects" aria-label="Presentation projects"><span className="guest-pc-kicker">Select a project <b>{String(data.projects.length).padStart(2, "0")}</b></span>{data.projects.map((project, index) => <div className="guest-pc-project-entry" key={project.id}>{(index === 0 || (data.projects[index - 1].category || "Projects") !== (project.category || "Projects")) && <div className="guest-pc-category-heading"><span>{String(index + 1).padStart(2, "0")} · Category</span><strong>{project.category || "Projects"}</strong></div>}<button type="button" className={active === index ? "active" : ""} aria-current={active === index ? "true" : undefined} onClick={() => setActive(index)}><small>{String(index + 1).padStart(2, "0")}</small><span><strong>{project.name}</strong><em>{project.department}</em></span><b aria-hidden="true">↗</b></button></div>)}</nav><DesktopCaseSlides key={selectedProject.id} token={token || ""} project={selectedProject} projectPosition={active + 1} projectCount={data.projects.length} /></div> : <section className="guest-showcase-empty"><span>Portfolio ready</span><h2>Projects will appear here shortly.</h2></section>}
      {selectedProject && <div className="guest-pc-bottom"><span>← → case study slides · ↑ ↓ projects</span><div><button type="button" disabled={active === 0} onClick={() => setActive(active - 1)} aria-label="Previous project">←</button><span>Project {String(active + 1).padStart(2, "0")} / {String(data.projects.length).padStart(2, "0")}</span><button type="button" disabled={active === data.projects.length - 1} onClick={() => setActive(active + 1)} aria-label="Next project">→</button></div></div>}
      {data.showPdfExport && <a className="guest-showcase-export guest-pc-export" href={`/api/public/showcase/${token}/portfolio.pdf`} download><span>Export PDF portfolio</span><b aria-hidden="true">↓</b></a>}
    </section> : <><section className="guest-showcase-intro"><span className="eyebrow">Made for the way we work</span><h1>{data.title}</h1><p>{data.intro}</p><div><strong>{String(data.projects.length).padStart(2, "0")}</strong><span>systems<br />in this showcase</span></div>{data.showPdfExport && <a className="guest-showcase-export" href={`/api/public/showcase/${token}/portfolio.pdf`} download><span>Export PDF portfolio</span><b aria-hidden="true">↓</b></a>}</section>
    {data.projects.length ? <>
      <div className="guest-showcase-rail" ref={rail} onScroll={event => {
        const element = event.currentTarget;
        const cards = Array.from(element.querySelectorAll<HTMLElement>(".guest-showcase-card"));
        const centre = element.scrollLeft + element.clientWidth / 2;
        const next = cards.reduce((best, card, index) =>
          Math.abs(card.offsetLeft + card.offsetWidth / 2 - centre) < Math.abs(cards[best].offsetLeft + cards[best].offsetWidth / 2 - centre) ? index : best, 0);
        activeRef.current = next;
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
          <div className="guest-showcase-copy"><span>{project.category || "Projects"} · {project.department}</span><h2>{project.name}</h2><p>{project.summary || "A focused digital solution created around the team's day-to-day work."}</p>{project.highlights?.length > 0 && <ul>{project.highlights.map(highlight => <li key={highlight}>{highlight}</li>)}</ul>}</div>
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
      <p className="guest-showcase-hint">Swipe to explore · advances automatically when idle</p>
    </> : <section className="guest-showcase-empty"><span>Portfolio ready</span><h2>Projects will appear here shortly.</h2></section>}</>}
    <footer className="guest-showcase-footer"><CompanyLogo /></footer>
    {openProjectId && <PortfolioCaseModal token={token || ""} projectId={openProjectId} onClose={() => setOpenProjectId(null)} />}
  </main>;
}

type PortfolioCaseData = {
  portfolioTitle: string;
  project: {
    id: number; name: string; summary: string; department: string; overview: string;
    storyEyebrow: string; storyTitle: string; overviewLabel: string; challengeLabel: string;
    solutionLabel: string; functionsLabel: string;
    problem: string; solution: string; features: string[]; impact: string;
    contribution: string; technologies: string[]; coverImageUrl: string | null;
  };
  gallery: { id: number; caption: string; imageUrl: string }[];
  storyImages: Partial<Record<StorySlot, string>>;
  previous: { id: number; name: string } | null;
  next: { id: number; name: string } | null;
};

type PresentationSlide = {
  id: string;
  label: string;
  kind: "cover" | "story" | "result";
};

function presentationExcerpt(value: string | null | undefined, limit = 210) {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).replace(/\s+\S*$/, "").trimEnd()}…`;
}

function DesktopCaseSlides({ token, project, projectPosition, projectCount }: { token: string; project: GuestProject; projectPosition: number; projectCount: number }) {
  const [detail, setDetail] = useState<PortfolioCaseData | null>(null);
  const [detailError, setDetailError] = useState("");
  const [slideIndex, setSlideIndex] = useState(0);
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    let current = true;
    void api<PortfolioCaseData>(`/api/public/showcase/${token}/projects/${project.id}`)
      .then(next => { if (current) { setDetail(next); setDetailError(""); } })
      .catch(error => { if (current) setDetailError((error as Error).message); });
    return () => { current = false; };
  }, [token, project.id]);

  const slides: PresentationSlide[] = [{ id: "cover", label: "Introduction", kind: "cover" }];
  if (detail) {
    const caseStudy = detail.project;
    if (caseStudy.overview || caseStudy.problem || caseStudy.solution || caseStudy.features.length) {
      slides.push({ id: "story", label: "The case study", kind: "story" });
    }
    if (detail.gallery.length || caseStudy.impact || caseStudy.contribution || caseStudy.technologies.length) {
      slides.push({ id: "result", label: "Visuals & outcome", kind: "result" });
    }
  }
  const slide = slides[Math.min(slideIndex, slides.length - 1)];
  const caseStudy = detail?.project;
  const galleryImage = detail?.gallery[imageIndex];

  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowRight") setSlideIndex(index => Math.min(index + 1, slides.length - 1));
      if (event.key === "ArrowLeft") setSlideIndex(index => Math.max(index - 1, 0));
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [slides.length]);

  return <div className="guest-pc-deck" aria-label={`${project.name} case study presentation`}>
    <div className="guest-pc-deck-category"><span>Project category</span><strong>{project.category || "Projects"}</strong><i aria-hidden="true" /></div>
    <nav className="guest-pc-slide-tabs" aria-label="Case study slides">{slides.map((item, index) => <button key={item.id} type="button" className={index === slideIndex ? "active" : ""} aria-current={index === slideIndex ? "step" : undefined} onClick={() => setSlideIndex(index)}><span>{String(index + 1).padStart(2, "0")}</span>{item.label}</button>)}</nav>
    <article className={`guest-pc-stage guest-pc-stage-${slide.kind}`} key={slide.id} aria-live="polite">
      {slide.kind === "cover" && <><div className="guest-pc-stage-art">{project.imageUrl ? <img src={project.imageUrl} alt={`Preview of ${project.name}`} /> : <div className="guest-pc-art-placeholder"><span>{String(projectPosition).padStart(2, "0")}</span><strong>DTU</strong></div>}<span className="guest-pc-stage-count">PROJECT {String(projectPosition).padStart(2, "0")} / {String(projectCount).padStart(2, "0")}</span></div><div className="guest-pc-stage-copy"><span className="eyebrow">{project.category || "Projects"} · {project.department}</span><h2>{project.name}</h2><p>{presentationExcerpt(caseStudy?.overview || project.summary, 260) || "A digital solution made for the way our teams work."}</p>{slides.length > 1 && <button type="button" onClick={() => setSlideIndex(1)}>View case study <span aria-hidden="true">→</span></button>}</div></>}
      {slide.kind === "story" && caseStudy && <div className="guest-pc-story-slide"><header><span className="eyebrow">{caseStudy.storyEyebrow || `${project.name} · Case study`}</span><h2>{caseStudy.storyTitle || "From challenge to solution"}</h2></header><div className="guest-pc-story-grid"><section><span>01 / {caseStudy.overviewLabel || "Overview"}</span><p>{presentationExcerpt(caseStudy.overview || caseStudy.summary, detail?.storyImages.overview ? 110 : 195)}</p>{detail?.storyImages.overview && <img src={detail.storyImages.overview} alt={`${caseStudy.overviewLabel || "Overview"} illustration`} />}</section><section><span>02 / {caseStudy.challengeLabel || "Challenge"}</span><p>{presentationExcerpt(caseStudy.problem || "The work called for a clearer, more connected process.", detail?.storyImages.challenge ? 110 : 195)}</p>{detail?.storyImages.challenge && <img src={detail.storyImages.challenge} alt={`${caseStudy.challengeLabel || "Challenge"} illustration`} />}</section><section><span>03 / {caseStudy.solutionLabel || "Solution"}</span><p>{presentationExcerpt(caseStudy.solution || caseStudy.summary, detail?.storyImages.solution ? 110 : 195)}</p>{detail?.storyImages.solution && <img src={detail.storyImages.solution} alt={`${caseStudy.solutionLabel || "Solution"} illustration`} />}</section></div>{caseStudy.features.length > 0 && <div className="guest-pc-story-functions"><strong>{caseStudy.functionsLabel || "Key functions"}</strong><div>{caseStudy.features.slice(0, 3).map((feature, index) => <span key={`${feature}-${index}`}>{feature}</span>)}</div></div>}</div>}
      {slide.kind === "result" && caseStudy && <><div className="guest-pc-stage-art guest-pc-result-art">{galleryImage ? <img src={galleryImage.imageUrl} alt={galleryImage.caption || `Image of ${project.name}`} /> : project.imageUrl ? <img src={project.imageUrl} alt={`Preview of ${project.name}`} /> : <div className="guest-pc-art-placeholder"><span>03</span><strong>DTU</strong></div>}{detail && detail.gallery.length > 1 && <div className="guest-pc-image-controls"><button type="button" disabled={imageIndex === 0} onClick={() => setImageIndex(index => index - 1)} aria-label="Previous gallery image">←</button><span>{imageIndex + 1} / {detail.gallery.length}</span><button type="button" disabled={imageIndex === detail.gallery.length - 1} onClick={() => setImageIndex(index => index + 1)} aria-label="Next gallery image">→</button></div>}</div><div className="guest-pc-stage-copy"><span className="eyebrow">Visuals & outcome</span><h2>{caseStudy.impact ? "The value it brings" : "See the project"}</h2>{galleryImage?.caption && <small className="guest-pc-image-caption">{galleryImage.caption}</small>}{caseStudy.impact && <p>{presentationExcerpt(caseStudy.impact, 150)}</p>}{caseStudy.contribution && <div className="guest-pc-contribution"><strong>Our contribution</strong><p>{presentationExcerpt(caseStudy.contribution, 80)}</p></div>}{caseStudy.technologies.length > 0 && <div className="guest-pc-technologies">{caseStudy.technologies.slice(0, 4).map(item => <span key={item}>{item}</span>)}</div>}</div></>}
    </article>
    {detailError && <p className="guest-pc-detail-error">Case study details are unavailable: {detailError}</p>}
    <div className="guest-pc-slide-controls"><span>Case study · {String(slideIndex + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span><div>{detail && <Link to={`/showcase/${token}/projects/${project.id}`}>Full details ↗</Link>}<button type="button" disabled={slideIndex === 0} onClick={() => setSlideIndex(index => index - 1)} aria-label="Previous case study slide">← Previous</button><button type="button" disabled={slideIndex === slides.length - 1} onClick={() => setSlideIndex(index => index + 1)} aria-label="Next case study slide">Next →</button></div></div>
  </div>;
}

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
    <nav className="portfolio-case-nav" aria-label="Case study sections"><a href={`#${sectionPrefix}-overview`}>{project.overviewLabel || "Overview"}</a>{project.features.length > 0 && <a href={`#${sectionPrefix}-capabilities`}>{project.functionsLabel || "What it does"}</a>}{images.length > 0 && <a href={`#${sectionPrefix}-gallery`}>Gallery</a>}{project.impact && <a href={`#${sectionPrefix}-impact`}>Impact</a>}</nav>
    <div className="portfolio-case-body">
      <section id={`${sectionPrefix}-overview`} className="portfolio-story-grid">
        <article className="portfolio-story-overview"><span>01 · {project.overviewLabel || "Overview"}</span><h2>{project.storyTitle || "Built around the work"}</h2><p>{project.overview || project.summary}</p></article>
        {project.problem && <article><span>02 · {project.challengeLabel || "Challenge"}</span><h3>{project.challengeLabel || "What needed to change"}</h3><p>{project.problem}</p></article>}
        <article><span>03 · {project.solutionLabel || "Solution"}</span><h3>{project.solutionLabel || "How the system responds"}</h3><p>{project.solution || project.summary}</p></article>
      </section>
      {project.features.length > 0 && <section id={`${sectionPrefix}-capabilities`} className="portfolio-capabilities"><header><span className="eyebrow">02 · {project.functionsLabel || "What it does"}</span><h2>{project.functionsLabel || "Core system functions"}</h2><p>A practical look at the functions designed for day-to-day users.</p></header><div>{project.features.map((feature, index) => <article key={`${feature}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><h3>{feature}</h3><i /></article>)}</div></section>}
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
  const load = () => api(`/api/public/showcase/${token}/projects/${activeProjectId}`).then(next => { setData(next); setError(""); }).catch(e => setError(e.message));

  useEffect(() => { setActiveProjectId(projectId); }, [projectId]);
  useEffect(() => {
    let current = true;
    setData(null); setError("");
    void api(`/api/public/showcase/${token}/projects/${activeProjectId}`).then(next => { if (current) setData(next); }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [token, activeProjectId]);
  useLiveRefresh(load, "/api/public/live");
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
  const load = () => api(`/api/public/showcase/${token}/projects/${projectId}`).then(next => { setData(next); setError(""); }).catch(e => setError(e.message));
  useEffect(() => {
    setData(null); setError("");
    window.scrollTo({ top: 0, behavior: "auto" });
    void load();
  }, [token, projectId]);
  useLiveRefresh(load, "/api/public/live");

  if (error) return <div className="guest-showcase guest-showcase-closed"><CompanyLogo /><div><span>Portfolio case study</span><h1>Unable to open this project.</h1><p>{error}</p><Link className="guest-showcase-explore" to={`/showcase/${token}`}>Back to portfolio</Link></div></div>;
  if (!data) return <div className="guest-showcase"><Loading /></div>;
  return <main className="guest-showcase portfolio-case-page">
    <header className="guest-showcase-header portfolio-case-header"><Link to={`/showcase/${token}`}><CompanyLogo /></Link><Link to={`/showcase/${token}`}>← All projects</Link></header>
    <PortfolioCaseContent data={data} token={token} />
    <footer className="guest-showcase-footer"><CompanyLogo /></footer>
  </main>;
}
