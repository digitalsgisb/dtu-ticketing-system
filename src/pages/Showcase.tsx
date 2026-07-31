import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  image_mode: "latest" | "custom" | "none";
  has_custom_image: number;
  latest_image_id: number | null;
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
};

export function ShowcasePage() {
  const [data, setData] = useState<ShowcaseAdminData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const load = () => api<ShowcaseAdminData>("/api/staff/showcase").then(next => {
    setData(next);
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

  const selected = data.projects.filter(project => project.visible).length;
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
      <div className="showcase-project-heading"><div><span className="eyebrow">Approved content</span><h2>Portfolio cards</h2><p>Use a progress photo, upload a cleaner cover, or show a text-only card.</p></div><span>{data.projects.length} available projects</span></div>
      <div className="showcase-editor-list">
        {data.projects.map(project => <ShowcaseProjectEditor key={project.id} project={project} onSaved={load} />)}
      </div>
    </section>
  </>;
}

function ShowcaseProjectEditor({ project, onSaved }: { project: ShowcaseProject; onSaved: () => void }) {
  const [visible, setVisible] = useState(Boolean(project.visible));
  const [title, setTitle] = useState(project.title_override ?? "");
  const [summary, setSummary] = useState(project.summary_override ?? "");
  const [sortOrder, setSortOrder] = useState(project.sort_order);
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
    setSortOrder(project.sort_order);
    setImageMode(project.image_mode);
  }, [project]);

  const save = async () => {
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      const body = new FormData();
      body.set("visible", String(visible));
      body.set("sortOrder", String(sortOrder));
      body.set("title", title);
      body.set("summary", summary);
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

  return <article className={`showcase-editor ${visible ? "is-selected" : ""}`}>
    <div className="showcase-editor-cover">
      {preview ? <img src={preview} alt="" /> : <div><strong>{project.project_no}</strong><span>Text-only card</span></div>}
      <label className="showcase-include"><input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} /><span>{visible ? "Included" : "Include"}</span></label>
    </div>
    <div className="showcase-editor-fields">
      <header><div><span>{project.project_no} · {project.department_name}</span><h3>{project.name}</h3></div><small>{humanize(project.status)}</small></header>
      <div className="showcase-editor-form">
        <label>Visitor title <small>optional</small><input value={title} maxLength={120} placeholder={project.name} onChange={e => setTitle(e.target.value)} /></label>
        <label>Display order<input type="number" min="0" max="999" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} /></label>
        <label className="showcase-summary-field">Visitor summary <small>optional</small><textarea rows={3} maxLength={800} value={summary} placeholder={project.description || "Add a short, visitor-friendly description"} onChange={e => setSummary(e.target.value)} /></label>
        <label>Cover style<select value={imageMode} onChange={e => setImageMode(e.target.value as typeof imageMode)}>
          <option value="latest">Latest progress photo</option>
          <option value="custom">Custom cover photo</option>
          <option value="none">No photo</option>
        </select></label>
        <label>Upload custom cover<input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={e => {
          const next = e.target.files?.[0] ?? null;
          setFile(next);
          if (next) setImageMode("custom");
        }} /></label>
      </div>
      <footer><ErrorNotice message={error} /><button className="button button-secondary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : saved ? "Saved" : "Save card"}</button></footer>
    </div>
  </article>;
}

export function PublicShowcasePage() {
  const { token } = useParams();
  const [data, setData] = useState<{ title: string; intro: string; projects: GuestProject[] } | null>(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
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
        {data.projects.map((project, index) => <article className="guest-showcase-card" key={project.id}>
          <div className={`guest-showcase-image ${project.imageUrl ? "" : "is-empty"}`}>
            {project.imageUrl ? <>
              <img className="guest-showcase-image-backdrop" src={project.imageUrl} alt="" aria-hidden="true" />
              <img className="guest-showcase-image-foreground" src={project.imageUrl} alt={`Preview of ${project.name}`} />
            </> : <div><span>{String(index + 1).padStart(2, "0")}</span><strong>DTU</strong></div>}
            <span className="guest-card-count">{String(index + 1).padStart(2, "0")} / {String(data.projects.length).padStart(2, "0")}</span>
          </div>
          <div className="guest-showcase-copy"><span>{project.department}</span><h2>{project.name}</h2><p>{project.summary || "A digital solution designed and delivered by the DTU team."}</p><footer><i /><span>Designed & delivered by DTU</span></footer></div>
        </article>)}
      </div>
      <nav className="guest-showcase-controls" aria-label="Showcase navigation">
        <button aria-label="Previous system" disabled={active === 0} onClick={() => move(active - 1)}>←</button>
        <div>{data.projects.map((project, index) => <button key={project.id} className={index === active ? "active" : ""} aria-label={`View ${project.name}`} onClick={() => move(index)} />)}</div>
        <button aria-label="Next system" disabled={active === data.projects.length - 1} onClick={() => move(active + 1)}>→</button>
      </nav>
      <p className="guest-showcase-hint">Swipe to explore</p>
    </> : <section className="guest-showcase-empty"><span>Portfolio ready</span><h2>Projects will appear here shortly.</h2></section>}
    <footer className="guest-showcase-footer"><CompanyLogo /><span>Digital Transformation Unit</span></footer>
  </main>;
}
