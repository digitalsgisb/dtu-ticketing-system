import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { Badge, Empty, ErrorNotice, Loading, Modal, PageHeader } from "../components/UI";
import { useI18n } from "../i18n";

export function RequestsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<any[] | null>(null);
  const [status, setStatus] = useState("");
  const [qr, setQr] = useState<any>(null);
  const [qrError, setQrError] = useState("");
  useEffect(() => { void api<any[]>("/api/staff/requests").then(setItems); }, []);
  const showQr = async () => {
    setQrError("");
    try { setQr(await api("/api/staff/requests/intake-qr")); }
    catch (error) { setQrError((error as Error).message); }
  };
  const filtered = useMemo(() => (items ?? []).filter(i => !status || i.status === status), [items, status]);
  if (!items) return <Loading />;
  return <>
    <PageHeader eyebrow="Demand intake" title={t("requests")} description="Triage new digitalization opportunities before they enter the active portfolio." actions={<button className="button button-primary" onClick={() => void showQr()}>Show employee request QR</button>} />
    <ErrorNotice message={qrError} />
    <div className="toolbar"><select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}><option value="">All stages</option>{["submitted","triage","needs_information","approved","rejected"].map(s => <option value={s} key={s}>{s.replaceAll("_"," ")}</option>)}</select><div className="result-count">{filtered.length} requests</div></div>
    {filtered.length ? <div className="request-list">{filtered.map(item => <Link to={`/requests/${item.id}`} className="request-card" key={item.id}>
      <div><span className="mono">{item.request_no}</span><Badge value={item.status} /></div><h2>{item.title}</h2><p>{item.current_problem}</p>
      <footer><span><small>{t("department")}</small>{item.department_name}</span><span><small>Requested by</small>{item.requester_name}</span><span><small>{t("submitted")}</small>{formatDate(item.created_at)}</span><Badge value={item.urgency} kind="priority" /></footer>
    </Link>)}</div> : <Empty title="No project requests in this stage" />}
    {qr && <EmployeeRequestQrModal qr={qr} onClose={() => setQr(null)} />}
  </>;
}

function EmployeeRequestQrModal({ qr, onClose }: { qr: any; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(qr.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return <Modal title="Employee project request QR" onClose={onClose} wide>
    <div className="request-qr-label" id="qr-label">
      <div className="request-qr-brand"><img src="/dtu-favicon.svg" alt="" /><div><strong>Digital Transformation Unit</strong><span>Project Request Portal</span></div></div>
      <div className="request-qr-content">
        <div><span className="eyebrow">Scan to submit</span><h2>Have an idea for a digitalization project?</h2><p>Employees can describe the current problem, expected outcome, urgency, and target date—no staff account required.</p><div className="request-qr-steps"><span><b>01</b>Submit request</span><span><b>02</b>Save tracking link</span><span><b>03</b>Follow DTU updates</span></div></div>
        <div className="request-qr-code-wrap"><img className="qr-code" src={qr.dataUrl} alt="Employee project request QR code" /><strong>Scan with your phone</strong></div>
      </div>
      <small>{qr.url}</small>
    </div>
    <div className="request-qr-actions">
      <a className="button button-secondary" href="/request" target="_blank" rel="noreferrer">Open employee form</a>
      <button className="button button-secondary" onClick={() => void copy()}>{copied ? "Link copied" : "Copy link"}</button>
      <a className="button button-secondary" href={qr.dataUrl} download="DTU-project-request-QR.png">Download QR only</a>
      <button className="button button-primary" onClick={() => window.print()}>Print QR poster</button>
    </div>
  </Modal>;
}

export function RequestDetailPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({ status: "triage", triageNotes: "", ownerId: "", dueDate: "" });
  const [comment, setComment] = useState("");
  const [publicVisible, setPublicVisible] = useState(true);
  const [error, setError] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [trackingBusy, setTrackingBusy] = useState<"open" | "email" | "">("");
  const [trackingNotice, setTrackingNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [trackingCopied, setTrackingCopied] = useState(false);
  const load = () => api(`/api/staff/requests/${id}`).then((d: any) => {
    setData(d);
    setForm(f => ({ ...f, status: d.item.status, triageNotes: d.item.triage_notes || "" }));
    setPublicBaseUrl(current => current || d.item.public_origin || window.location.origin);
  });
  useEffect(() => { void load(); void api<any[]>("/api/staff/users").then(setUsers); }, [id]);
  if (!data) return <Loading />;
  const item = data.item;
  const update = async (status: string) => {
    setError("");
    try { await api(`/api/staff/requests/${id}`, json("PATCH", { ...form, status, ownerId: form.ownerId ? Number(form.ownerId) : null, dueDate: form.dueDate || null })); await load(); }
    catch (e) { setError((e as Error).message); }
  };
  const addComment = async () => {
    if (!comment.trim()) return;
    await api(`/api/staff/requests/${id}/comments`, json("POST", { body: comment, publicVisible }));
    setComment(""); await load();
  };
  const createTrackingLink = async (email: boolean) => {
    setTrackingNotice(null);
    setTrackingBusy(email ? "email" : "open");
    const trackerWindow = email ? null : window.open("about:blank", "_blank");
    if (trackerWindow) trackerWindow.opener = null;
    try {
      const result = await api<{ trackingUrl: string; recipient: string; emailSent: boolean; emailReason?: string }>(
        `/api/staff/requests/${id}/tracking-link`, json("POST", { email, publicBaseUrl })
      );
      setTrackingUrl(result.trackingUrl);
      setPublicBaseUrl(result.trackingUrl.split("/track/")[0]);
      if (trackerWindow) trackerWindow.location.replace(result.trackingUrl);
      if (email) setTrackingNotice(result.emailSent
        ? { kind: "success", text: `Tracking email sent to ${result.recipient}.` }
        : { kind: "error", text: `Link created, but email was not sent: ${result.emailReason || "mail delivery failed"}.` });
      else setTrackingNotice({ kind: "success", text: trackerWindow ? "Secure tracker opened in a new tab." : "Secure link created. Use Open tracker below." });
      await load();
    } catch (e) {
      trackerWindow?.close();
      setTrackingNotice({ kind: "error", text: (e as Error).message });
    } finally {
      setTrackingBusy("");
    }
  };
  const copyTrackingLink = async () => {
    if (!trackingUrl) return;
    try {
      await navigator.clipboard.writeText(trackingUrl);
      setTrackingCopied(true);
      window.setTimeout(() => setTrackingCopied(false), 1800);
    } catch { setTrackingNotice({ kind: "error", text: "Copy failed. Select and copy the link manually." }); }
  };
  return <>
    <PageHeader eyebrow={item.request_no} title={item.title} description={`Requested by ${item.requester_name} · ${item.department_name}`} actions={<><Badge value={item.urgency} kind="priority" /><Badge value={item.status} /></>} />
    <ErrorNotice message={error} />
    <div className="detail-layout">
      <div className="detail-main">
        <section className="panel request-brief"><div><span className="eyebrow">Current problem</span><p>{item.current_problem}</p></div><div><span className="eyebrow">Desired outcome</span><p>{item.desired_outcome}</p></div>
          <div className="detail-facts"><div><small>Expected users</small><strong>{item.expected_users || "—"}</strong></div><div><small>Target date</small><strong>{formatDate(item.target_date)}</strong></div><div><small>Contact</small><strong>{item.requester_email}</strong></div></div>
          {data.attachments?.length > 0 && <div className="request-attachment-block"><span className="eyebrow">Proposal attachments</span><div className="attachment-list">{data.attachments.map((attachment: any) => <a href={`/api/staff/attachments/${attachment.id}`} key={attachment.id}>📎 {attachment.original_name}</a>)}</div></div>}
        </section>
        <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Discussion</span><h2>{t("comments")}</h2></div></div>
          {data.comments.length ? <div className="comment-list">{data.comments.map((c: any) => <article className="comment" key={c.id}><div className="avatar">{c.author_name[0]}</div><div><div><strong>{c.author_name}</strong><span>{formatDate(c.created_at, true)}</span></div><p>{c.body}</p></div></article>)}</div> : <Empty title="No updates yet" />}
          <div className="comment-form"><textarea rows={3} value={comment} onChange={e => setComment(e.target.value)} placeholder="Ask a question or record a triage note…" /><div><label className="checkbox"><input type="checkbox" checked={publicVisible} onChange={e => setPublicVisible(e.target.checked)} />{t("publicUpdate")}</label><button className="button button-primary" onClick={() => void addComment()}>{t("addComment")}</button></div></div>
        </section>
      </div>
      <aside className="panel detail-sidebar">
        <section className="request-tracking-tools">
          <div className="request-tracking-heading"><div><span className="eyebrow">Requester access</span><h2>Secure tracking link</h2></div><span className="secure-pill">Private</span></div>
          <p>Create a fresh link you can open, copy, or send to <strong>{item.requester_email}</strong>.</p>
          <label>Public portal address<input type="url" inputMode="url" value={publicBaseUrl} onChange={e => setPublicBaseUrl(e.target.value)} placeholder="https://requests.your-company.com" /></label>
          <div className="request-tracking-actions">
            <button className="button button-secondary" disabled={Boolean(trackingBusy)} onClick={() => void createTrackingLink(false)}>{trackingBusy === "open" ? "Opening…" : "Open tracker"}</button>
            <button className="button button-primary" disabled={Boolean(trackingBusy)} onClick={() => void createTrackingLink(true)}>{trackingBusy === "email" ? "Sending…" : "Resend tracking email"}</button>
          </div>
          {trackingUrl && <div className="request-tracking-result"><small>Latest secure link</small><input value={trackingUrl} readOnly aria-label="Latest secure tracking link" /><div><a className="button button-secondary" href={trackingUrl} target="_blank" rel="noreferrer">Open</a><button className="button button-secondary" onClick={() => void copyTrackingLink()}>{trackingCopied ? "Copied" : "Copy"}</button></div></div>}
          {trackingNotice && <div className={`notice ${trackingNotice.kind === "success" ? "notice-success" : "notice-error"}`} role="status">{trackingNotice.text}</div>}
        </section>
        <div className="panel-heading"><div><span className="eyebrow">Triage</span><h2>Decision</h2></div></div>
        <label>Internal triage notes<textarea rows={5} value={form.triageNotes} onChange={e => setForm({ ...form, triageNotes: e.target.value })} /></label>
        <label>Project owner<select value={form.ownerId} onChange={e => setForm({ ...form, ownerId: e.target.value })}><option value="">Unassigned</option>{users.filter(u => u.active).map(u => <option value={u.id} key={u.id}>{u.name}</option>)}</select></label>
        <label>Proposed deadline<input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></label>
        <button className="button button-primary button-block" onClick={() => void update("approved")}>{t("approve")}</button>
        <button className="button button-secondary button-block" onClick={() => void update("needs_information")}>{t("needsInfo")}</button>
        <button className="button button-danger-text button-block" onClick={() => void update("rejected")}>{t("reject")}</button>
        {item.created_project_id && <Link className="notice notice-success" to={`/projects/${item.created_project_id}`}>Project created — open it →</Link>}
      </aside>
    </div>
  </>;
}
