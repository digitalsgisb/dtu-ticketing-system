import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { useAuth } from "../auth";
import { Badge, Empty, ErrorNotice, Loading, Modal, PageHeader } from "../components/UI";
import { useI18n } from "../i18n";
import { CompanyLogo } from "../components/CompanyLogo";

const completeLikeProjectStatuses = new Set(["complete_monitoring", "completed"]);
const projectStatusOptions = [
  ["planned", "Planned"],
  ["in_progress", "In progress"],
  ["on_hold", "On hold"],
  ["complete_monitoring", "Complete and Monitoring"],
  ["completed", "Completed"]
] as const;

export function ProjectDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  const [qr, setQr] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [updatingProgress, setUpdatingProgress] = useState(false);
  const [error, setError] = useState("");
  const load = () => api(`/api/staff/projects/${id}`).then(setData).catch(e => setError(e.message));
  useEffect(() => { void load(); }, [id]);
  if (error && !data) return <ErrorNotice message={error} />;
  if (!data) return <Loading />;
  const { project, workItems } = data;
  const displayedProgress = completeLikeProjectStatuses.has(project.status) ? 100 : project.progress;
  const canUpdateProgress = project.status !== "cancelled" && Boolean(user && (user.role !== "member" || project.owner_id === user.id));

  return <>
    <PageHeader eyebrow={project.project_no} title={project.name} description={project.description || "No description has been added."} actions={<>
      <button className="button button-secondary" onClick={() => void api(`/api/staff/projects/${id}/qr`).then(setQr)}>QR label</button>
      {canUpdateProgress && <button className="button button-secondary" onClick={() => setUpdatingProgress(true)}>Update progress</button>}
      {user?.role !== "member" && <button className="button button-primary" onClick={() => setEditing(true)}>Edit project</button>}
    </>} />
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
      <div className="panel-heading"><div><span className="eyebrow">Delivery & support</span><h2>Project work</h2></div><Link className="button button-secondary" to={`/tickets?projectId=${project.id}`}>Open full queue</Link></div>
      {workItems.length ? <div className="data-table">
        <div className="table-head"><span>Reference</span><span>Work item</span><span>{t("assignee")}</span><span>{t("dueDate")}</span><span>{t("status")}</span></div>
        {workItems.map((item: any) => <Link to={`/tickets/${item.id}`} className="table-row" key={item.id}><span className="mono">{item.ticket_no}</span><span><strong>{item.title}</strong><small><Badge value={item.type} kind="type" /></small></span><span>{item.assignee_name || "Unassigned"}</span><span>{formatDate(item.due_date)}</span><span><Badge value={item.status} /></span></Link>)}
      </div> : <Empty body="Create the first task or issue for this project." />}
    </section>
    {editing && <EditProject project={project} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); }} />}
    {updatingProgress && <ProgressUpdate project={project} onClose={() => setUpdatingProgress(false)} onSaved={() => { setUpdatingProgress(false); void load(); }} />}
    {qr && <QrModal qr={qr} onClose={() => setQr(null)} />}
  </>;
}

function ProgressUpdate({ project, onClose, onSaved }: { project: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ status: project.status, progress: project.progress, currentUpdate: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api(`/api/staff/projects/${project.id}/progress`, json("PATCH", {
        ...form,
        progress: Number(form.progress)
      }));
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
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>{t("cancel")}</button><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Publish update"}</button></div>
    </form>
  </Modal>;
}

function EditProject({ project, onClose, onSaved }: { project: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: project.name, description: project.description, departmentName: project.department_name, status: project.status, priority: project.priority, dueDate: project.due_date || "", progress: project.progress });
  const [error, setError] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api(`/api/staff/projects/${project.id}`, json("PATCH", { ...form, dueDate: form.dueDate || null, progress: Number(form.progress) })); onSaved(); }
    catch (err) { setError((err as Error).message); }
  };
  return <Modal title="Edit project" onClose={onClose}><form className="form-stack" onSubmit={save}><ErrorNotice message={error} />
    <label>{t("title")}<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
    <label>{t("description")}<textarea rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
    <div className="form-grid">
      <label>{t("status")}<select value={form.status} onChange={e => {
        const status = e.target.value;
        setForm({ ...form, status, progress: completeLikeProjectStatuses.has(status) ? 100 : form.progress });
      }}>{projectStatusOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}<option value="cancelled">Cancelled</option></select></label>
      <label>{t("priority")}<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label>
      <label>{t("dueDate")}<input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></label>
      <label>{t("progress")} ({form.progress}%)<input type="range" min="0" max="100" step="5" value={form.progress} onChange={e => setForm({ ...form, progress: Number(e.target.value) })} /></label>
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
