import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatDate, humanize } from "../api";
import { Badge, Empty, ErrorNotice, Loading } from "../components/UI";
import { CompanyLogo } from "../components/CompanyLogo";
import { useLiveRefresh } from "../live";

function PublicShell({ children }: { children: ReactNode }) {
  return <div className="public-page"><header className="public-header"><Link to="/request" className="brand company-brand public-brand"><CompanyLogo /><small>DTU Secure Request Portal</small></Link></header>{children}<footer className="public-footer">Sugihara Grand Industries · DTU Control Centre · Secure request portal</footer></div>;
}

function Success({ reference, trackingUrl, emailSent }: { reference: string; trackingUrl: string; emailSent?: boolean }) {
  return <div className="public-card success-card"><div className="success-check">✓</div><span className="eyebrow">Submission received</span><h1>{reference}</h1><p>DTU has received your submission. Save the private tracking link below.</p>{emailSent !== undefined && <div className={`notice ${emailSent ? "notice-success" : "notice-error"}`}>{emailSent ? ("A copy of this tracking link has been sent to your email.") : ("We could not send the email copy. Please save the working link below.")}</div>}<a className="button button-primary button-large" href={trackingUrl}>Track my submission</a><small>{trackingUrl}</small></div>;
}

declare global {
  interface Window {
    turnstile?: { render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void }) => string };
  }
}

function TurnstileField() {
  const host = useRef<HTMLDivElement>(null);
  const [siteKey, setSiteKey] = useState("");
  const [token, setToken] = useState("");
  useEffect(() => { void api<{ turnstileSiteKey: string }>("/api/public/config").then(result => setSiteKey(result.turnstileSiteKey)); }, []);
  useEffect(() => {
    if (!siteKey || !host.current) return;
    const render = () => {
      if (window.turnstile && host.current && !host.current.childElementCount) {
        window.turnstile.render(host.current, { sitekey: siteKey, callback: setToken, "expired-callback": () => setToken("") });
      }
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-dtu-turnstile]');
    if (existing) { existing.addEventListener("load", render, { once: true }); render(); return; }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true; script.defer = true; script.dataset.dtuTurnstile = "true";
    script.addEventListener("load", render, { once: true });
    document.head.appendChild(script);
  }, [siteKey]);
  return <><input type="hidden" name="turnstileToken" value={token} readOnly />{siteKey && <div ref={host} className="turnstile-field" />}</>;
}

export function PublicIssuePage() {
  const { token } = useParams();
  const [project, setProject] = useState<any>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api(`/api/public/projects/${token}`).then((d: any) => setProject(d.project)).catch(e => setError(e.message));
  useEffect(() => { void load(); }, [token]);
  useLiveRefresh(load, "/api/public/live");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setError("");
    try { setSuccess(await api(`/api/public/projects/${token}/issues`, { method: "POST", body: new FormData(e.currentTarget) })); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return <PublicShell>{success ? <Success reference={success.ticketNo} trackingUrl={success.trackingUrl} emailSent={success.emailSent} /> : <main className="public-main">
    <section className="public-intro"><span className="eyebrow">Project support</span><h1>Tell us what went wrong.</h1><p>Your report goes directly to the DTU work queue. Add enough detail for us to investigate quickly.</p></section>
    <section className="public-card">
      {error && !project ? <ErrorNotice message={error} /> : !project ? <Loading /> : <>
        <div className="project-context"><span>{project.project_no}</span><strong>{project.name}</strong><small>{project.department_name}</small></div>
        <form className="form-stack" onSubmit={submit}><ErrorNotice message={error} />
          <div className="form-grid">
            <label>Your name<input name="reporterName" required minLength={2} /></label>
            <label>Department<select name="department" defaultValue="" required><option value="" disabled>Select department</option><option value="Production">Production</option><option value="Quality">Quality</option><option value="Logistic">Logistic</option><option value="Others">Others</option></select></label>
            <label>Email (optional)<input name="email" type="email" placeholder="name@example.com" /></label>
            <label>Phone (optional)<input name="phone" /></label>
          </div>
          <label>Issue title<input name="title" required minLength={3} placeholder="Short summary of the problem" /></label>
          <label>What happened?<textarea name="description" required minLength={10} rows={6} placeholder="What were you doing, what did you expect, and what happened instead?" /></label>
          <div className="form-grid"><label>Urgency<select name="urgency" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label><label>Photos or PDF (max 3)<input name="attachments" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple /></label></div>
          <TurnstileField />
          <button className="button button-primary button-large" disabled={busy}>{busy ? "Sending…" : "Submit issue report"}</button>
        </form>
      </>}
    </section>
  </main>}</PublicShell>;
}

export function PublicRequestPage() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setError("");
    try { setSuccess(await api("/api/public/requests", { method: "POST", body: new FormData(e.currentTarget) })); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return <PublicShell>{success ? <Success reference={success.requestNo} trackingUrl={success.trackingUrl} emailSent={success.emailSent} /> : <main className="public-main public-request-main">
    <section className="public-intro proposal-intro">
      <span className="eyebrow">Digitalization proposal</span>
      <h1>Turn a better way of working into reality.</h1>
      <p>Share the challenge, the outcome you imagine, and any supporting material. DTU will review feasibility, impact, priority, and the best next step.</p>
      <div className="proposal-benefits"><span><b>01</b>Describe the need</span><span><b>02</b>Attach evidence</span><span><b>03</b>Track the review</span></div>
    </section>
    <section className="public-card proposal-card">
      <div className="proposal-card-head"><span>New proposal</span><h2>Tell us what should change</h2><p>Required fields are marked with an asterisk.</p></div>
      <form className="form-stack proposal-form" onSubmit={submit} encType="multipart/form-data"><ErrorNotice message={error} />
        <div className="proposal-section"><div className="proposal-section-title"><b>01</b><div><strong>Proposal overview</strong><small>Give your idea a clear, memorable title.</small></div></div>
          <label>Request title *<input name="title" required minLength={3} placeholder="e.g. Digital production handover" /></label>
        </div>
        <div className="proposal-section"><div className="proposal-section-title"><b>02</b><div><strong>Your details</strong><small>So the DTU team can follow up with you.</small></div></div>
          <div className="form-grid"><label>Your name *<input name="requesterName" required /></label><label>Department *<input name="department" required /></label><label>Email *<input name="email" type="email" required placeholder="name@sugihara.com" /></label><label>Phone (optional)<input name="phone" /></label></div>
        </div>
        <div className="proposal-section"><div className="proposal-section-title"><b>03</b><div><strong>Business need</strong><small>Help us understand the problem and the result you need.</small></div></div>
          <label>What is the current problem? *<textarea name="currentProblem" rows={5} required minLength={10} placeholder="Describe the current process, pain points, and who is affected…" /></label>
          <label>What outcome do you need? *<textarea name="desiredOutcome" rows={5} required minLength={10} placeholder="Describe what success would look like…" /></label>
          <div className="form-grid proposal-facts"><label>Expected users<input name="expectedUsers" type="number" min="1" /></label><label>Urgency<select name="urgency" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label><label>Desired target date<input name="targetDate" type="date" /></label></div>
        </div>
        <div className="proposal-section"><div className="proposal-section-title"><b>04</b><div><strong>Supporting documents</strong><small>Add your proposal, process map, spreadsheet, presentation, or pictures.</small></div></div>
          <label className="proposal-upload"><input name="attachments" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp" multiple onChange={event => setFiles(Array.from(event.target.files ?? []))} /><span className="proposal-upload-icon">↥</span><strong>Drop files here or click to browse</strong><small>PDF, Word, Excel, PowerPoint, TXT, CSV or images · max 5 files · 10 MB each</small></label>
          {files.length > 0 && <div className="proposal-file-list">{files.map(file => <span key={`${file.name}-${file.lastModified}`}><b>✓</b><span>{file.name}</span><small>{file.size < 1024 * 1024 ? `${Math.ceil(file.size / 1024)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}</small></span>)}</div>}
        </div>
        <TurnstileField />
        <div className="proposal-submit"><div><strong>Ready for DTU review?</strong><small>You’ll receive a private tracking link after submission.</small></div><button className="button button-primary button-large" disabled={busy}>{busy ? "Sending…" : "Submit proposal →"}</button></div>
      </form>
    </section>
  </main>}</PublicShell>;
}

export function TrackingPage() {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [reply, setReply] = useState("");
  const load = () => api(`/api/public/track/${token}`).then(setData).catch(e => setError(e.message));
  useEffect(() => { void load(); }, [token]);
  useLiveRefresh(load, "/api/public/live");
  const send = async () => {
    try { await api(`/api/public/track/${token}/replies`, { method: "POST", body: JSON.stringify({ authorName: name, body: reply }) }); setReply(""); await load(); }
    catch (e) { setError((e as Error).message); }
  };
  return <PublicShell><main className="tracking-main">{error && !data ? <div className="public-card"><ErrorNotice message={error} /></div> : !data ? <Loading /> : <>
    <section className="tracking-hero"><span className="eyebrow">{data.kind === "issue" ? "Issue tracking" : "Project request tracking"}</span><div><h1>{data.item.reference_no}</h1><Badge value={data.item.project_status || data.item.status} /></div><h2>{data.item.title}</h2>{data.item.project_name && <p>{data.item.project_no} · {data.item.project_name}</p>}</section>
    {data.kind === "request" && data.item.project_no && <section className="public-card tracking-project-card">
      <div className="tracking-project-heading"><div><span className="eyebrow">Approved project</span><h3>Delivery progress</h3></div><strong>{data.item.project_progress}%</strong></div>
      <div className="bar"><i style={{ width: `${data.item.project_progress}%` }} /></div>
      {data.item.project_current_update && <div className="tracking-project-update"><small>Latest update from DTU</small><p>{data.item.project_current_update}</p></div>}
      {data.item.project_next_action && <div className="tracking-project-update"><small>What happens next</small><p>{data.item.project_next_action}</p></div>}
      {data.item.handover_url && <a className="button button-primary" href={data.item.handover_url} target="_blank" rel="noreferrer">Open project handover</a>}
    </section>}
    <section className="tracking-grid"><div className="public-card"><h3>Request stage</h3><div className="tracking-statuses">{(data.kind === "issue" ? ["new","triaged","assigned","in_progress","waiting","resolved","closed"] : ["submitted","triage","needs_information","approved"]).map((s: string) => <div className={s === data.item.status ? "current" : ""} key={s}><i />{humanize(s)}</div>)}</div><div className="tracking-meta"><span><small>Submitted</small>{formatDate(data.item.created_at, true)}</span><span><small>Last update</small>{formatDate(data.item.project_progress_updated_at || data.item.updated_at, true)}</span></div></div>
      <div className="public-card"><h3>Updates from DTU</h3>{data.comments.length ? <div className="comment-list">{data.comments.map((c: any) => <article className="comment" key={c.id}><div className="avatar">{c.author_name[0]}</div><div><div><strong>{c.author_name}</strong><span>{formatDate(c.created_at, true)}</span></div><p>{c.body}</p></div></article>)}</div> : <Empty title="No updates yet" />}
        {data.attachments?.length > 0 && <div className="attachment-list">{data.attachments.map((a: any) => <a href={`/api/public/attachments/${a.id}/${token}`} key={a.id}>📎 {a.original_name}</a>)}</div>}
        <div className="public-reply"><ErrorNotice message={error} /><input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} /><textarea rows={3} placeholder="Reply to DTU…" value={reply} onChange={e => setReply(e.target.value)} /><button className="button button-primary" onClick={() => void send()} disabled={!name.trim() || !reply.trim()}>Send reply</button></div>
      </div></section>
  </>}</main></PublicShell>;
}
