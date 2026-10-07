import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { Badge, Empty, ErrorNotice, Loading, Modal, PageHeader } from "../components/UI";
import { useI18n } from "../i18n";
import { useLiveRefresh } from "../live";
import { AssigneePicker } from "../components/AssigneePicker";
import { useAuth } from "../auth";
import { canCompleteWork, completionLabel } from "../components/WorkItems";

export function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [params, setParams] = useSearchParams();
  const load = () => api(`/api/staff/tickets/${id}`).then(setData).catch(e => setError(e.message));
  useEffect(() => { void load(); void api<any[]>("/api/staff/users").then(setUsers); }, [id]);
  useLiveRefresh(load);
  useEffect(() => {
    if (data && String(data.item.id) === id && params.get("complete") === "1") {
      if (canCompleteWork(data.item, user)) setShowComplete(true);
      const next = new URLSearchParams(params); next.delete("complete");
      setParams(next, { replace: true });
    }
  }, [data, id, user, params, setParams]);
  if (error && !data) return <ErrorNotice message={error} />;
  if (!data) return <Loading />;
  const item = data.item;
  const memberTask = user?.role === "member";
  const deleteWork = async () => {
    if (deleting) return;
    setDeleting(true); setDeleteError("");
    try { await api(`/api/staff/tickets/${item.id}`, json("DELETE")); navigate("/tickets"); }
    catch (failure) { setDeleteError((failure as Error).message); setDeleting(false); }
  };

  return <>
    <PageHeader eyebrow={`${item.ticket_no} · ${item.type}`} title={item.title} description={item.project_name ? `Part of ${item.project_name}` : "General DTU work"} actions={<div className="ticket-header-badges"><Badge value={item.priority} kind="priority" /><Badge value={item.status} />{canCompleteWork(item, user) && <button className="button button-primary" onClick={() => setShowComplete(true)}>{completionLabel(item, user)}</button>}{(user?.role === "admin" || user?.role === "lead") && <button className="button button-secondary" onClick={() => setEditing(true)}>{item.type === "task" ? "Edit task" : "Edit issue"}</button>}{user?.role === "admin" && <button className="button button-danger" onClick={() => setShowDelete(true)}>Delete work</button>}</div>} />
    {showComplete && <CompleteTaskModal item={item} onClose={() => setShowComplete(false)} onCompleted={() => { setShowComplete(false); void load(); }} />}
    {showDelete && <Modal title="Delete work item?" onClose={() => { if (!deleting) setShowDelete(false); }}><div className="form-stack">
      <p>Permanently delete <strong>{item.ticket_no} · {item.title}</strong>, including its comments, completion evidence, attachments, and tracking links? The project will be kept.</p>
      <ErrorNotice message={deleteError} />
      <div className="form-actions"><button className="button button-secondary" disabled={deleting} onClick={() => setShowDelete(false)}>Cancel</button><button className="button button-danger" disabled={deleting} onClick={() => void deleteWork()}>{deleting ? "Deleting…" : "Delete permanently"}</button></div>
    </div></Modal>}
    {editing && <EditWorkItemModal item={item} users={users} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); }} />}
    <div className={`detail-layout${memberTask ? " ticket-assignee-layout" : ""}`}>
      <div className="detail-main">
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">Work brief</span><h2>{t("description")}</h2></div></div>
          <p className="long-copy">{item.description || "No description has been added."}</p>
          {item.reporter_name && <div className="reporter-card"><div className="avatar">{item.reporter_name[0]}</div><div><small>{t("reporter")}</small><strong>{item.reporter_name}</strong><span>{[item.reporter_department, item.reporter_email, item.reporter_phone].filter(Boolean).join(" · ")}</span></div></div>}
        </section>
        {memberTask && <TicketSidebar item={item} users={users} onUpdated={load} onComplete={() => setShowComplete(true)} memberView />}
        <CompletionEvidence data={data} />
        <CommentsPanel data={data} item={item} onUpdated={load} />
        {data.auditEvents.length > 0 && <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Accountability</span><h2>Audit history</h2></div></div>
          <div className="timeline">{data.auditEvents.map((event: any) => <div className="timeline-item" key={event.id}><i /><div><strong>{event.actor_name}</strong><span>{event.action.replaceAll("_"," ")}</span><small>{formatDate(event.created_at, true)}</small></div></div>)}</div>
        </section>}
      </div>
      {!memberTask && <TicketSidebar item={item} users={users} onUpdated={load} onComplete={() => setShowComplete(true)} />}
    </div>
  </>;
}

function EditWorkItemModal({ item, users, onClose, onSaved }: { item: any; users: any[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: item.title as string, description: item.description || "", priority: item.priority,
    completionMode: item.completion_mode || "individual", assigneeIds: (item.assignees || []).map((assignee: { id: number }) => assignee.id) as number[], dueDate: item.due_date || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try { await api(`/api/staff/tickets/${item.id}`, json("PATCH", { ...form, dueDate: form.dueDate || null })); onSaved(); }
    catch (failure) { setError((failure as Error).message); setBusy(false); }
  };
  return <Modal title={item.type === "task" ? "Edit task" : "Edit issue"} onClose={() => { if (!busy) onClose(); }}><form className="form-stack" onSubmit={submit}>
    <ErrorNotice message={error} />
    <fieldset className="task-edit-fields" disabled={busy}>
      <label>Title<input required minLength={3} maxLength={200} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
      <label>Description<textarea rows={4} maxLength={5000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      <label>Completion method<select value={form.completionMode} onChange={e => setForm({ ...form, completionMode: e.target.value })}><option value="individual">Individual — every assignee completes their part</option><option value="group">Group — one assignee completes for everyone</option></select></label>
      {form.completionMode !== item.completion_mode && <p className="ticket-assignee-guidance" role="status">Changing the completion method reopens this work item and resets completion checks. Existing updates and evidence stay in the history.</p>}
      <AssigneePicker users={users} value={form.assigneeIds} onChange={assigneeIds => setForm({ ...form, assigneeIds })} />
      <label>Priority<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label>
      <label>Due date<input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></label>
    </fieldset>
    <div className="form-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || form.title.trim().length < 3}>{busy ? "Saving…" : "Save changes"}</button></div>
  </form></Modal>;
}

function TicketSidebar({ item, users, onUpdated, onComplete, memberView = false }: { item: any; users: any[]; onUpdated: () => void; onComplete: () => void; memberView?: boolean }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManageTask = user?.role === "admin" || user?.role === "lead";
  const groupTask = item.completion_mode === "group";
  const myAssignment = item.assignees?.find((assignee: { id: number }) => assignee.id === user?.id);
  const memberHeading = !myAssignment ? "Work details" : ["resolved", "closed"].includes(item.status) && groupTask ? "Team work complete" : myAssignment.completed_at ? "Your work submitted" : "Submit your work";
  const canComplete = canCompleteWork(item, user);
  const canEditSettings = canManageTask;
  const statuses = [
    ["new", "New"],
    ["triaged", "Triaged"],
    ["assigned", "Assigned"],
    ["in_progress", "In progress"],
    ["waiting", "Waiting"],
    ["resolved", "Resolved"],
    ["closed", "Closed"]
  ] as const;
  const [form, setForm] = useState({ status: item.status, priority: item.priority, completionMode: item.completion_mode || "individual", assigneeIds: (item.assignees || []).map((user: { id: number }) => user.id) as number[], dueDate: item.due_date || "" });
  const [busy, setBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setForm({ status: item.status, priority: item.priority, completionMode: item.completion_mode || "individual", assigneeIds: (item.assignees || []).map((user: { id: number }) => user.id), dueDate: item.due_date || "" });
  }, [item.status, item.priority, item.completion_mode, item.assignee_name, item.due_date]);
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
  return <aside className={`panel detail-sidebar ticket-control-panel${memberView ? " ticket-assignee-panel" : ""}`}><div className="panel-heading"><div><span className="eyebrow">{memberView ? "Your assignment" : "Control"}</span><h2>{memberView ? memberHeading : "Work settings"}</h2></div></div>
    <ErrorNotice message={error} />
    {memberView && <p className="ticket-assignee-guidance">{!myAssignment ? "You are not assigned to submit this work item." : groupTask ? "One assignee can submit the team's result and files. This finishes the work item for everyone." : "Submit your result and any files when your part is ready. The work finishes after every assignee submits."}</p>}
    <div className="ticket-quick-actions">
      {canComplete && <button type="button" className="button button-primary" disabled={Boolean(statusBusy) || busy} onClick={onComplete}>{completionLabel(item, user)}</button>}
      {!['in_progress', 'resolved', 'closed'].includes(item.status) && (canManageTask || Boolean(myAssignment && (groupTask || !myAssignment.completed_at))) && <button type="button" className="button button-secondary" disabled={Boolean(statusBusy) || busy} onClick={() => void changeStatus("in_progress")}>{statusBusy === "in_progress" ? "Starting…" : "Start work"}</button>}
      {['resolved', 'closed'].includes(item.status) && (canManageTask) && <button type="button" className="button button-secondary" disabled={Boolean(statusBusy) || busy} onClick={() => void changeStatus("in_progress")}>{statusBusy === "in_progress" ? "Reopening…" : "Reopen work"}</button>}
    </div>
    {!canComplete && !["resolved", "closed"].includes(item.status) && <p className="ticket-assignee-guidance" role="status">{myAssignment?.completed_at ? "Your part is complete. Waiting for the remaining assignees to submit." : item.assignee_total ? `Only an assigned person can complete ${groupTask ? "this team's work" : "their part"}. Assigned to: ${item.assignee_name || item.assignees.map((person: any) => person.name).join(", ")}.` : "This work item must be assigned before you can complete it."}</p>}
    {memberView && myAssignment?.completed_at && <p className="ticket-assignee-done">Your work was submitted. You can see your note and files in Completion evidence below.</p>}
    {memberView && ["resolved", "closed"].includes(item.status) && groupTask && <p className="ticket-assignee-done">The team work is complete. Its submitted evidence is below.</p>}
    {item.assignee_total > 0 && <p className="ticket-team-summary">{groupTask ? `Group completion · ${item.assignee_total} assignee${item.assignee_total === 1 ? "" : "s"}. One person submits the team's completion.` : `${item.assignee_completed} of ${item.assignee_total} people finished.${myAssignment?.completed_at && !["resolved", "closed"].includes(item.status) ? " Your part is complete; others are still working." : ""}`}</p>}
    {canEditSettings && <><div className="settings-divider"><span>Details & schedule</span></div>
    <label>{t("status")}<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{statuses.filter(([status]) =>
      !item.assignee_total || status === item.status || (item.completion_mode !== "group" && item.assignee_completed === item.assignee_total) || !["resolved", "closed"].includes(status)
    ).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>
    <label>{t("priority")}<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label>
    <label>Completion method<select value={form.completionMode} onChange={e => setForm({ ...form, completionMode: e.target.value })}><option value="individual">Individual — every assignee completes their part</option><option value="group">Group — one assignee completes for everyone</option></select><small>Changing this reopens the work item and clears current completion checks. Earlier notes and files remain in the history.</small></label>
    <AssigneePicker users={users} value={form.assigneeIds} onChange={assigneeIds => setForm({ ...form, assigneeIds })} />
    <label>{t("dueDate")}<input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></label>
    <button className="button button-primary button-block" onClick={save} disabled={busy || Boolean(statusBusy)}>{busy ? "Saving…" : "Save changes"}</button></>}
    <div className="sidebar-facts">{item.project_id && <Link to={`/projects/${item.project_id}`}><small>Project</small><strong>{item.project_name}</strong></Link>}<div><small>Created</small><strong>{formatDate(item.created_at, true)}</strong></div><div><small>Source</small><strong>{item.source.toUpperCase()}</strong></div></div>
  </aside>;
}

function CompleteTaskModal({ item, onClose, onCompleted }: { item: any; onClose: () => void; onCompleted: () => void }) {
  const { user } = useAuth();
  const adminComplete = user?.role === "admin";
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!note.trim() && !files.length) return setError("Add a short note or choose at least one file before submitting.");
    if (files.length > 3 || files.some(file => file.size > 5 * 1024 * 1024)) return setError("Choose up to 3 files, 5 MB each.");
    setBusy(true);
    setError("");
    const body = new FormData();
    body.set("note", note);
    if (adminComplete) body.set("completeAll", "true");
    files.forEach(file => body.append("attachments", file));
    try { await api(`/api/staff/tickets/${item.id}/complete`, { method: "POST", body }); onCompleted(); }
    catch (failure) { setError((failure as Error).message); setBusy(false); }
  };
  const groupTask = item.completion_mode === "group";
  return <Modal title={adminComplete ? "Complete work as admin" : groupTask ? "Submit for the team" : "Submit your work"} onClose={() => { if (!busy) onClose(); }}><form className="form-stack task-completion-form" onSubmit={submit}>
    <p className="task-completion-context"><strong>{item.ticket_no} · {item.title}</strong><span>{adminComplete ? "As admin, this completes the entire work item for all assignees. Your note and files are recorded as admin completion evidence. Earlier submissions are kept." : groupTask ? "This submission completes the task for everyone." : item.assignee_total > 1 ? `Your submission is recorded separately. The work finishes when all ${item.assignee_total} assignees submit.` : "This submission completes your work."}</span></p>
    <ErrorNotice message={error} />
    <label>What did you complete?<textarea rows={4} maxLength={5000} value={note} onChange={event => setNote(event.target.value)} placeholder="Describe the result or work delivered…" /><small>Optional if you attach a file.</small></label>
    <label>Add photos or documents<input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={event => { setFiles(Array.from(event.target.files ?? [])); setError(""); }} /><small>Choose up to 3 files, 5 MB each. A note or file is required.</small></label>
    {files.length > 0 && <div className="completion-file-list" aria-live="polite">{files.map((file, index) => <span key={`${file.name}-${index}`}>📎 {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</span>)}</div>}
    <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-primary" disabled={busy || (!note.trim() && !files.length) || files.length > 3 || files.some(file => file.size > 5 * 1024 * 1024)}>{busy ? "Submitting…" : groupTask ? "Complete team work" : "Submit completion"}</button></div>
  </form></Modal>;
}

function CompletionEvidence({ data }: { data: any }) {
  const completions = data.comments.filter((comment: any) => comment.is_completion);
  const assignees = data.item.completion_mode !== "group" ? data.item.assignees || [] : [];
  if (!completions.length && !assignees.length) return null;
  const currentCommentIds = new Set(assignees.map((assignee: any) => assignee.completion_comment_id).filter(Boolean));
  const historical = assignees.length ? completions.filter((comment: any) => !currentCommentIds.has(comment.id)) : [];
  const evidence = (comment: any) => {
    const files = data.attachments.filter((attachment: any) => attachment.comment_id === comment.id);
    return <><small>Submitted by {comment.author_name}</small><p>{comment.body}</p>{files.length > 0 && <div className="completion-evidence-files">{files.map((file: any) => {
      const previewable = file.mime_type.startsWith("image/") || file.mime_type === "application/pdf";
      return <a key={file.id} href={`/api/staff/attachments/${file.id}${previewable ? "/preview" : ""}`} target={previewable ? "_blank" : undefined} rel={previewable ? "noopener noreferrer" : undefined}>
      {file.mime_type.startsWith("image/") && <img src={`/api/staff/attachments/${file.id}/preview`} alt={file.original_name} />}
      <span>📎 {file.original_name}</span></a>;
    })}</div>}</>;
  };
  return <section className="panel completion-evidence"><div className="panel-heading"><div><span className="eyebrow">Delivery record</span><h2>Completion evidence</h2></div></div>
    {assignees.length > 0 ? <>
      <p className="ticket-team-summary">{data.item.assignee_completed} of {data.item.assignee_total} people finished. Each person’s note and files appear below.</p>
      {assignees.map((assignee: any) => {
        const comment = completions.find((entry: any) => entry.id === assignee.completion_comment_id);
        return <article key={assignee.id} className={`completion-evidence-entry${assignee.completed_at ? " is-complete" : " is-pending"}`}>
          <div><strong>{assignee.name}</strong><small>{assignee.completed_at ? `Completed ${formatDate(assignee.completed_at, true)}` : "Waiting for submission"}</small></div>
          {comment ? evidence(comment) : <p>{assignee.completed_at ? "Completed before individual evidence was recorded." : "No evidence submitted yet."}</p>}
        </article>;
      })}
      {historical.length > 0 && <div className="completion-history"><h3>Earlier completion records</h3>{historical.map((comment: any) => <article key={comment.id} className="completion-evidence-entry"><div><strong>{comment.author_name}</strong><small>{formatDate(comment.created_at, true)}</small></div>{evidence(comment)}</article>)}</div>}
    </> : completions.map((comment: any) => <article key={comment.id} className="completion-evidence-entry"><div><strong>{comment.author_name}</strong><small>{formatDate(comment.created_at, true)}</small></div>{evidence(comment)}</article>)}
  </section>;
}

type ConversationAttachment = { id: number; original_name: string; mime_type: string; size: number; comment_id: number | null };

function ConversationFiles({ files }: { files: ConversationAttachment[] }) {
  return <div className="chat-files">{files.map(file => {
    const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.mime_type);
    const previewable = isImage || file.mime_type === "application/pdf";
    return <a className="chat-file" key={file.id} href={`/api/staff/attachments/${file.id}${previewable ? "/preview" : ""}`} target={previewable ? "_blank" : undefined} rel={previewable ? "noopener noreferrer" : undefined}>
      {isImage && <img src={`/api/staff/attachments/${file.id}/preview`} alt={file.original_name} loading="lazy" />}
      <span>{isImage ? "" : "📎 "}{file.original_name}<small>{Math.ceil(file.size / 1024)} KB · {previewable ? "Open" : "Download"}</small></span>
    </a>;
  })}</div>;
}

function CommentsPanel({ data, item, onUpdated }: { data: any; item: any; onUpdated: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [publicVisible, setPublicVisible] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const urls = files.map(file => ["image/jpeg", "image/png", "image/webp"].includes(file.type) ? URL.createObjectURL(file) : "");
    setPreviews(urls);
    return () => urls.forEach(url => { if (url) URL.revokeObjectURL(url); });
  }, [files]);
  const [error, setError] = useState("");
  const comments = data.comments.filter((comment: any) => !comment.is_completion);
  const attachments = data.attachments.filter((file: ConversationAttachment) => file.comment_id == null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!body.trim()) return setError("Write a short update to send with your files.");
    if (files.length > 3 || files.some(file => file.size > 5 * 1024 * 1024)) return setError("Choose up to 3 files, 5 MB each.");
    setError(""); setBusy(true);
    const form = new FormData(); form.set("body", body); form.set("publicVisible", String(publicVisible));
    Array.from(files ?? []).forEach(file => form.append("attachments", file));
    try { await api(`/api/staff/tickets/${item.id}/comments`, { method: "POST", body: form }); setBody(""); setFiles([]); if (fileInput.current) fileInput.current.value = ""; onUpdated(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Conversation</span><h2>{t("comments")}</h2></div></div>
    <ErrorNotice message={error} />
    {comments.length ? <div className="chat-messages">{comments.map((comment: any) => <article className={`chat-message${comment.author_user_id === user?.id ? " is-own" : ""}`} key={comment.id}>
      <div className="avatar" aria-hidden="true">{comment.author_name?.[0] || "?"}</div>
      <div className="chat-bubble"><div className="chat-meta"><strong>{comment.author_name}</strong><time>{formatDate(comment.created_at, true)}</time>{comment.public_visible ? <Badge value="public" kind="type" /> : null}</div>
        <p>{comment.body}</p><ConversationFiles files={data.attachments.filter((file: ConversationAttachment) => file.comment_id === comment.id)} />
      </div>
    </article>)}</div> : <Empty title="No updates yet" />}
    {attachments.length > 0 && <div className="chat-original-files"><h3>Original attachments</h3><ConversationFiles files={attachments} /></div>}
    <form className="comment-form" onSubmit={submit}>
      <textarea aria-label="Write an update" required maxLength={5000} rows={3} placeholder="Write a useful update…" value={body} disabled={busy} onChange={e => setBody(e.target.value)} />
      {files.length > 0 && <ul className="chat-pending-files">{files.map((file, index) => <li key={`${file.name}-${index}`}>
        {previews[index] && <img src={previews[index]} alt={`Preview of ${file.name}`} />}<span>{file.name}</span><button type="button" className="icon-button" aria-label={`Remove ${file.name}`} disabled={busy} onClick={() => { setFiles(current => current.filter((_, i) => i !== index)); if (fileInput.current) fileInput.current.value = ""; }}>×</button>
      </li>)}</ul>}
      <div><label className="checkbox"><input type="checkbox" checked={publicVisible} disabled={busy} onChange={e => setPublicVisible(e.target.checked)} />{t("publicUpdate")}</label>
        <label className="chat-upload">Attach photos or PDF<input ref={fileInput} className="file-input" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple disabled={busy} onChange={e => { setFiles(Array.from(e.target.files ?? [])); setError(""); }} /><small>Up to 3 files, 5 MB each</small></label>
        <button className="button button-primary" disabled={busy || !body.trim() || files.length > 3 || files.some(file => file.size > 5 * 1024 * 1024)}>{busy ? "Sending…" : "Send update"}</button>
      </div>
    </form>
  </section>;
}
