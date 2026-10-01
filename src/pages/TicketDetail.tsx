import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { Badge, Empty, ErrorNotice, Loading, Modal, PageHeader } from "../components/UI";
import { useI18n } from "../i18n";
import { useLiveRefresh } from "../live";
import { AssigneePicker } from "../components/AssigneePicker";

export function TicketDetailPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState("");
  const load = () => api(`/api/staff/tickets/${id}`).then(setData).catch(e => setError(e.message));
  useEffect(() => { void load(); void api<any[]>("/api/staff/users").then(setUsers); }, [id]);
  useLiveRefresh(load);
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
        <CompletionEvidence data={data} />
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
  const [form, setForm] = useState({ status: item.status, priority: item.priority, assigneeIds: (item.assignees || []).map((user: { id: number }) => user.id) as number[], dueDate: item.due_date || "" });
  const [busy, setBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState("");
  const [error, setError] = useState("");
  const [showComplete, setShowComplete] = useState(false);
  useEffect(() => {
    setForm({ status: item.status, priority: item.priority, assigneeIds: (item.assignees || []).map((user: { id: number }) => user.id), dueDate: item.due_date || "" });
  }, [item.status, item.priority, item.assignee_name, item.due_date]);
  const changeStatus = async (status: string) => {
    if (status === item.status || statusBusy) return;
    setError("");
    setStatusBusy(status);
    try {
      await api(`/api/staff/tickets/${item.id}`, json("PATCH", { status }));
      onUpdated();
    } catch (err) { setError((err as Error).message); }
    finally {
      setStatusBusy("");
    }
  };
  const save = async () => {
    setError("");
    setBusy(true);
    try { await api(`/api/staff/tickets/${item.id}`, json("PATCH", { ...form, dueDate: form.dueDate || null })); onUpdated(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return <aside className="panel detail-sidebar ticket-control-panel"><div className="panel-heading"><div><span className="eyebrow">Control</span><h2>Work settings</h2></div></div>
    <ErrorNotice message={error} />
    <div className="ticket-quick-actions">
      {!['in_progress', 'resolved', 'closed'].includes(item.status) && <button type="button" className="button button-primary" disabled={Boolean(statusBusy) || busy} onClick={() => void changeStatus("in_progress")}>{statusBusy === "in_progress" ? "Starting…" : "Start work"}</button>}
      {!['resolved', 'closed'].includes(item.status) && <button type="button" className="button button-secondary" disabled={Boolean(statusBusy) || busy} onClick={() => setShowComplete(true)}>Complete with evidence</button>}
      {['resolved', 'closed'].includes(item.status) && <button type="button" className="button button-secondary" disabled={Boolean(statusBusy) || busy} onClick={() => void changeStatus("in_progress")}>{statusBusy === "in_progress" ? "Reopening…" : "Reopen work"}</button>}
    </div>
    <div className="settings-divider"><span>Details & schedule</span></div>
    <label>{t("status")}<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{statuses.map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>
    <label>{t("priority")}<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label>
    <AssigneePicker users={users} value={form.assigneeIds} onChange={assigneeIds => setForm({ ...form, assigneeIds })} />
    <label>{t("dueDate")}<input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></label>
    <button className="button button-primary button-block" onClick={save} disabled={busy || Boolean(statusBusy)}>{busy ? "Saving…" : "Save changes"}</button>
    <div className="sidebar-facts">{item.project_id && <Link to={`/projects/${item.project_id}`}><small>Project</small><strong>{item.project_name}</strong></Link>}<div><small>Created</small><strong>{formatDate(item.created_at, true)}</strong></div><div><small>Source</small><strong>{item.source.toUpperCase()}</strong></div></div>
    {showComplete && <CompleteTaskModal item={item} onClose={() => setShowComplete(false)} onCompleted={() => { setShowComplete(false); onUpdated(); }} />}
  </aside>;
}

function CompleteTaskModal({ item, onClose, onCompleted }: { item: any; onClose: () => void; onCompleted: () => void }) {
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const body = new FormData();
    body.set("note", note);
    files.forEach(file => body.append("attachments", file));
    try { await api(`/api/staff/tickets/${item.id}/complete`, { method: "POST", body }); onCompleted(); }
    catch (failure) { setError((failure as Error).message); setBusy(false); }
  };
  return <Modal title={`Complete ${item.ticket_no}`} onClose={onClose} wide><form className="form-stack" onSubmit={submit}>
    <p className="muted">Add a short result and up to 3 documents or photos. Everyone assigned to this work item will see the completion evidence.</p>
    {item.project_id && item.type === "task" && <div className="notice notice-success">This task will count toward the project’s task completion percentage.</div>}
    <ErrorNotice message={error} />
    <label>Completion note (optional)<textarea rows={4} maxLength={5000} value={note} onChange={event => setNote(event.target.value)} placeholder="What was delivered?" /></label>
    <label>Documents or photos (optional)<input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={event => setFiles(Array.from(event.target.files ?? []))} /><small>Up to 3 files, 5 MB each.</small></label>
    {files.length > 0 && <div className="completion-file-list">{files.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}</span>)}</div>}
    <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-primary" disabled={busy || files.length > 3}>{busy ? "Completing…" : "Mark complete"}</button></div>
  </form></Modal>;
}

function CompletionEvidence({ data }: { data: any }) {
  const completions = data.comments.filter((comment: any) => comment.is_completion);
  if (!completions.length) return null;
  return <section className="panel completion-evidence"><div className="panel-heading"><div><span className="eyebrow">Delivery record</span><h2>Completion evidence</h2></div></div>
    {completions.map((comment: any) => {
      const files = data.attachments.filter((attachment: any) => attachment.comment_id === comment.id);
      return <article key={comment.id} className="completion-evidence-entry"><div><strong>{comment.author_name}</strong><small>{formatDate(comment.created_at, true)}</small></div><p>{comment.body}</p>
        {files.length > 0 && <div className="completion-evidence-files">{files.map((file: any) => <a key={file.id} href={`/api/staff/attachments/${file.id}`}>
          {file.mime_type.startsWith("image/") && <img src={`/api/staff/attachments/${file.id}/preview`} alt={file.original_name} />}
          <span>📎 {file.original_name}</span></a>)}</div>}
      </article>;
    })}
  </section>;
}

function CommentsPanel({ data, item, onUpdated }: { data: any; item: any; onUpdated: () => void }) {
  const { t } = useI18n();
  const [body, setBody] = useState("");
  const [publicVisible, setPublicVisible] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState("");
  const comments = data.comments.filter((comment: any) => !comment.is_completion);
  const attachments = data.attachments.filter((attachment: any) => !data.comments.some((comment: any) => comment.is_completion && comment.id === attachment.comment_id));
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    const form = new FormData(); form.set("body", body); form.set("publicVisible", String(publicVisible));
    Array.from(files ?? []).forEach(file => form.append("attachments", file));
    try { await api(`/api/staff/tickets/${item.id}/comments`, { method: "POST", body: form }); setBody(""); setFiles(null); onUpdated(); }
    catch (err) { setError((err as Error).message); }
  };
  return <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Conversation</span><h2>{t("comments")}</h2></div></div>
    <ErrorNotice message={error} />
    {comments.length ? <div className="comment-list">{comments.map((comment: any) => <article className="comment" key={comment.id}><div className="avatar">{comment.author_name[0]}</div><div><div><strong>{comment.author_name}</strong><span>{formatDate(comment.created_at, true)}</span>{comment.public_visible ? <Badge value="public" kind="type" /> : null}</div><p>{comment.body}</p></div></article>)}</div> : <Empty title="No updates yet" />}
    {attachments.length > 0 && <div className="attachment-list">{attachments.map((a: any) => <a href={`/api/staff/attachments/${a.id}`} key={a.id}>📎 {a.original_name} <small>{Math.ceil(a.size / 1024)} KB</small></a>)}</div>}
    <form className="comment-form" onSubmit={submit}><textarea required rows={3} placeholder="Write a useful update…" value={body} onChange={e => setBody(e.target.value)} /><div><label className="checkbox"><input type="checkbox" checked={publicVisible} onChange={e => setPublicVisible(e.target.checked)} />{t("publicUpdate")}</label><input className="file-input" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple onChange={e => setFiles(e.target.files)} /><button className="button button-primary">{t("addComment")}</button></div></form>
  </section>;
}
