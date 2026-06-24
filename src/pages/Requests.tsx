import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { Badge, Empty, ErrorNotice, Loading, PageHeader } from "../components/UI";
import { useI18n } from "../i18n";

export function RequestsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<any[] | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => { void api<any[]>("/api/staff/requests").then(setItems); }, []);
  const filtered = useMemo(() => (items ?? []).filter(i => !status || i.status === status), [items, status]);
  if (!items) return <Loading />;
  return <>
    <PageHeader eyebrow="Demand intake" title={t("requests")} description="Triage new digitalization opportunities before they enter the active portfolio." />
    <div className="toolbar"><select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}><option value="">All stages</option>{["submitted","triage","needs_information","approved","rejected"].map(s => <option value={s} key={s}>{s.replaceAll("_"," ")}</option>)}</select><div className="result-count">{filtered.length} requests</div></div>
    {filtered.length ? <div className="request-list">{filtered.map(item => <Link to={`/requests/${item.id}`} className="request-card" key={item.id}>
      <div><span className="mono">{item.request_no}</span><Badge value={item.status} /></div><h2>{item.title}</h2><p>{item.current_problem}</p>
      <footer><span><small>{t("department")}</small>{item.department_name}</span><span><small>Requested by</small>{item.requester_name}</span><span><small>{t("submitted")}</small>{formatDate(item.created_at)}</span><Badge value={item.urgency} kind="priority" /></footer>
    </Link>)}</div> : <Empty title="No project requests in this stage" />}
  </>;
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
  const load = () => api(`/api/staff/requests/${id}`).then((d: any) => { setData(d); setForm(f => ({ ...f, status: d.item.status, triageNotes: d.item.triage_notes || "" })); });
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
  return <>
    <PageHeader eyebrow={item.request_no} title={item.title} description={`Requested by ${item.requester_name} · ${item.department_name}`} actions={<><Badge value={item.urgency} kind="priority" /><Badge value={item.status} /></>} />
    <ErrorNotice message={error} />
    <div className="detail-layout">
      <div className="detail-main">
        <section className="panel request-brief"><div><span className="eyebrow">Current problem</span><p>{item.current_problem}</p></div><div><span className="eyebrow">Desired outcome</span><p>{item.desired_outcome}</p></div>
          <div className="detail-facts"><div><small>Expected users</small><strong>{item.expected_users || "—"}</strong></div><div><small>Target date</small><strong>{formatDate(item.target_date)}</strong></div><div><small>Contact</small><strong>{item.requester_email}</strong></div></div>
        </section>
        <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Discussion</span><h2>{t("comments")}</h2></div></div>
          {data.comments.length ? <div className="comment-list">{data.comments.map((c: any) => <article className="comment" key={c.id}><div className="avatar">{c.author_name[0]}</div><div><div><strong>{c.author_name}</strong><span>{formatDate(c.created_at, true)}</span></div><p>{c.body}</p></div></article>)}</div> : <Empty title="No updates yet" />}
          <div className="comment-form"><textarea rows={3} value={comment} onChange={e => setComment(e.target.value)} placeholder="Ask a question or record a triage note…" /><div><label className="checkbox"><input type="checkbox" checked={publicVisible} onChange={e => setPublicVisible(e.target.checked)} />{t("publicUpdate")}</label><button className="button button-primary" onClick={() => void addComment()}>{t("addComment")}</button></div></div>
        </section>
      </div>
      <aside className="panel detail-sidebar"><div className="panel-heading"><div><span className="eyebrow">Triage</span><h2>Decision</h2></div></div>
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
