import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { Badge, Empty, ErrorNotice, Loading, PageHeader } from "../components/UI";
import { useI18n } from "../i18n";

export function TicketDetailPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState("");
  const load = () => api(`/api/staff/tickets/${id}`).then(setData).catch(e => setError(e.message));
  useEffect(() => { void load(); void api<any[]>("/api/staff/users").then(setUsers); }, [id]);
  if (error && !data) return <ErrorNotice message={error} />;
  if (!data) return <Loading />;
  const item = data.item;

  return <>
    <PageHeader eyebrow={`${item.ticket_no} · ${item.type}`} title={item.title} description={item.project_name ? `Part of ${item.project_name}` : "General DTU work"} actions={<div className="ticket-header-badges"><Badge value={item.priority} kind="priority" /><Badge value={item.status} /></div>} />
    <div className="detail-layout">
      <div className="detail-main">
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">Work brief</span><h2>{t("description")}</h2></div></div>
          <p className="long-copy">{item.description || "No description has been added."}</p>
          {item.reporter_name && <div className="reporter-card"><div className="avatar">{item.reporter_name[0]}</div><div><small>{t("reporter")}</small><strong>{item.reporter_name}</strong><span>{[item.reporter_department, item.reporter_email, item.reporter_phone].filter(Boolean).join(" · ")}</span></div></div>}
        </section>
        <CommentsPanel data={data} item={item} onUpdated={load} />
        {data.auditEvents.length > 0 && <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Accountability</span><h2>Audit history</h2></div></div>
          <div className="timeline">{data.auditEvents.map((event: any) => <div className="timeline-item" key={event.id}><i /><div><strong>{event.actor_name}</strong><span>{event.action.replaceAll("_"," ")}</span><small>{formatDate(event.created_at, true)}</small></div></div>)}</div>
        </section>}
      </div>
      <TicketSidebar item={item} users={users} onUpdated={load} />
    </div>
  </>;
}

function TicketSidebar({ item, users, onUpdated }: { item: any; users: any[]; onUpdated: () => void }) {
  const { t } = useI18n();
  const statuses = [
    ["new", "New"],
    ["triaged", "Triaged"],
    ["assigned", "Assigned"],
    ["in_progress", "In progress"],
    ["waiting", "Waiting"],
    ["resolved", "Resolved"],
    ["closed", "Closed"]
  ] as const;
  const [form, setForm] = useState({ priority: item.priority, assigneeId: item.assignee_id ? String(item.assignee_id) : "", dueDate: item.due_date || "" });
  const [busy, setBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState("");
  useEffect(() => {
    setForm({ priority: item.priority, assigneeId: item.assignee_id ? String(item.assignee_id) : "", dueDate: item.due_date || "" });
  }, [item.priority, item.assignee_id, item.due_date]);
  const changeStatus = async (status: string) => {
    if (status === item.status || statusBusy) return;
    setStatusBusy(status);
    try {
      await api(`/api/staff/tickets/${item.id}`, json("PATCH", { status }));
      onUpdated();
    } finally {
      setStatusBusy("");
    }
  };
  const save = async () => {
    setBusy(true);
    try { await api(`/api/staff/tickets/${item.id}`, json("PATCH", { ...form, assigneeId: form.assigneeId ? Number(form.assigneeId) : null, dueDate: form.dueDate || null })); onUpdated(); }
    finally { setBusy(false); }
  };
  return <aside className="panel detail-sidebar ticket-control-panel"><div className="panel-heading"><div><span className="eyebrow">Control</span><h2>Work settings</h2></div></div>
    <div className="status-control">
      <div className="status-control-label"><span>{t("status")}</span><small>Click a stage to update immediately</small></div>
      <div className="status-stage-grid">
        {statuses.map(([status, label], index) => <button
          type="button"
          key={status}
          className={`status-stage status-stage-${status} ${item.status === status ? "active" : ""}`}
          disabled={Boolean(statusBusy)}
          onClick={() => void changeStatus(status)}
        >
          <i>{statusBusy === status ? "…" : item.status === status ? "✓" : String(index + 1).padStart(2, "0")}</i>
          <span>{label}</span>
        </button>)}
      </div>
    </div>
    <div className="settings-divider"><span>Assignment & schedule</span></div>
    <label>{t("priority")}<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label>
    <label>{t("assignee")}<select value={form.assigneeId} onChange={e => setForm({ ...form, assigneeId: e.target.value })}><option value="">Unassigned</option>{users.filter(u => u.active).map(u => <option value={u.id} key={u.id}>{u.name}</option>)}</select></label>
    <label>{t("dueDate")}<input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></label>
    <button className="button button-primary button-block" onClick={save} disabled={busy}>{busy ? "Saving…" : t("save")}</button>
    <div className="sidebar-facts">{item.project_id && <Link to={`/projects/${item.project_id}`}><small>Project</small><strong>{item.project_name}</strong></Link>}<div><small>Created</small><strong>{formatDate(item.created_at, true)}</strong></div><div><small>Source</small><strong>{item.source.toUpperCase()}</strong></div></div>
  </aside>;
}

function CommentsPanel({ data, item, onUpdated }: { data: any; item: any; onUpdated: () => void }) {
  const { t } = useI18n();
  const [body, setBody] = useState("");
  const [publicVisible, setPublicVisible] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    const form = new FormData(); form.set("body", body); form.set("publicVisible", String(publicVisible));
    Array.from(files ?? []).forEach(file => form.append("attachments", file));
    try { await api(`/api/staff/tickets/${item.id}/comments`, { method: "POST", body: form }); setBody(""); setFiles(null); onUpdated(); }
    catch (err) { setError((err as Error).message); }
  };
  return <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Conversation</span><h2>{t("comments")}</h2></div></div>
    <ErrorNotice message={error} />
    {data.comments.length ? <div className="comment-list">{data.comments.map((comment: any) => <article className="comment" key={comment.id}><div className="avatar">{comment.author_name[0]}</div><div><div><strong>{comment.author_name}</strong><span>{formatDate(comment.created_at, true)}</span>{comment.public_visible ? <Badge value="public" kind="type" /> : null}</div><p>{comment.body}</p></div></article>)}</div> : <Empty title="No updates yet" />}
    {data.attachments.length > 0 && <div className="attachment-list">{data.attachments.map((a: any) => <a href={`/api/staff/attachments/${a.id}`} key={a.id}>📎 {a.original_name} <small>{Math.ceil(a.size / 1024)} KB</small></a>)}</div>}
    <form className="comment-form" onSubmit={submit}><textarea required rows={3} placeholder="Write a useful update…" value={body} onChange={e => setBody(e.target.value)} /><div><label className="checkbox"><input type="checkbox" checked={publicVisible} onChange={e => setPublicVisible(e.target.checked)} />{t("publicUpdate")}</label><input className="file-input" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple onChange={e => setFiles(e.target.files)} /><button className="button button-primary">{t("addComment")}</button></div></form>
  </section>;
}
