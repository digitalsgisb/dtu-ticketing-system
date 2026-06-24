import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { useAuth } from "../auth";
import { Badge, Empty, ErrorNotice, Loading, Modal, PageHeader } from "../components/UI";
import { useI18n } from "../i18n";
import { CompanyLogo } from "../components/CompanyLogo";

export function ProjectDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  const [qr, setQr] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const load = () => api(`/api/staff/projects/${id}`).then(setData).catch(e => setError(e.message));
  useEffect(() => { void load(); }, [id]);
  if (error && !data) return <ErrorNotice message={error} />;
  if (!data) return <Loading />;
  const { project, workItems } = data;

  return <>
    <PageHeader eyebrow={project.project_no} title={project.name} description={project.description || "No description has been added."} actions={<>
      <button className="button button-secondary" onClick={() => void api(`/api/staff/projects/${id}/qr`).then(setQr)}>QR label</button>
      {user?.role !== "member" && <button className="button button-primary" onClick={() => setEditing(true)}>Edit project</button>}
    </>} />
    <section className="detail-hero">
      <div className="detail-status"><Badge value={project.status} /><Badge value={project.priority} kind="priority" /></div>
      <div className="detail-facts">
        <div><small>{t("department")}</small><strong>{project.department_name}</strong></div>
        <div><small>{t("owner")}</small><strong>{project.owner_name || "Unassigned"}</strong></div>
        <div><small>{t("dueDate")}</small><strong>{formatDate(project.due_date)}</strong></div>
        <div><small>{t("progress")}</small><strong>{project.progress}%</strong></div>
      </div>
      <div className="hero-progress"><i style={{ width: `${project.progress}%` }} /></div>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">Delivery & support</span><h2>Project work</h2></div><Link className="button button-secondary" to={`/tickets?projectId=${project.id}`}>Open full queue</Link></div>
      {workItems.length ? <div className="data-table">
        <div className="table-head"><span>Reference</span><span>Work item</span><span>{t("assignee")}</span><span>{t("dueDate")}</span><span>{t("status")}</span></div>
        {workItems.map((item: any) => <Link to={`/tickets/${item.id}`} className="table-row" key={item.id}><span className="mono">{item.ticket_no}</span><span><strong>{item.title}</strong><small><Badge value={item.type} kind="type" /></small></span><span>{item.assignee_name || "Unassigned"}</span><span>{formatDate(item.due_date)}</span><span><Badge value={item.status} /></span></Link>)}
      </div> : <Empty body="Create the first task or issue for this project." />}
    </section>
    {editing && <EditProject project={project} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); }} />}
    {qr && <QrModal qr={qr} onClose={() => setQr(null)} />}
  </>;
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
      <label>{t("status")}<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
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
