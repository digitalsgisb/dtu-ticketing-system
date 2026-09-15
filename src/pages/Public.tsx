import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatDate, humanize } from "../api";
import { Badge, Empty, ErrorNotice, Loading } from "../components/UI";
import { useI18n } from "../i18n";
import { CompanyLogo } from "../components/CompanyLogo";
import { useLiveRefresh } from "../live";

function PublicShell({ children }: { children: ReactNode }) {
  const { lang, setLang } = useI18n();
  return <div className="public-page"><header className="public-header"><Link to="/request" className="brand company-brand public-brand"><CompanyLogo /><small>DTU Secure Request Portal</small></Link><button className="language-button" onClick={() => setLang(lang === "en" ? "ms" : "en")}>{lang === "en" ? "Bahasa Melayu" : "English"}</button></header>{children}<footer className="public-footer">Sugihara Grand Industries · DTU Control Centre · Secure request portal</footer></div>;
}

function Success({ reference, trackingUrl, emailSent }: { reference: string; trackingUrl: string; emailSent?: boolean }) {
  const { lang } = useI18n();
  return <div className="public-card success-card"><div className="success-check">✓</div><span className="eyebrow">{lang === "en" ? "Submission received" : "Permohonan diterima"}</span><h1>{reference}</h1><p>{lang === "en" ? "DTU has received your submission. Save the private tracking link below." : "DTU telah menerima permohonan anda. Simpan pautan jejak peribadi di bawah."}</p>{emailSent !== undefined && <div className={`notice ${emailSent ? "notice-success" : "notice-error"}`}>{emailSent ? (lang === "en" ? "A copy of this tracking link has been sent to your email." : "Salinan pautan penjejakan ini telah dihantar ke e-mel anda.") : (lang === "en" ? "We could not send the email copy. Please save the working link below." : "Salinan e-mel tidak dapat dihantar. Sila simpan pautan yang berfungsi di bawah.")}</div>}<a className="button button-primary button-large" href={trackingUrl}>{lang === "en" ? "Track my submission" : "Jejak permohonan saya"}</a><small>{trackingUrl}</small></div>;
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
  const { lang } = useI18n();
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
    <section className="public-intro"><span className="eyebrow">Project support</span><h1>{lang === "en" ? "Tell us what went wrong." : "Beritahu kami masalah yang berlaku."}</h1><p>{lang === "en" ? "Your report goes directly to the DTU work queue. Add enough detail for us to investigate quickly." : "Laporan anda akan terus masuk ke senarai kerja DTU. Berikan maklumat yang cukup untuk siasatan pantas."}</p></section>
    <section className="public-card">
      {error && !project ? <ErrorNotice message={error} /> : !project ? <Loading /> : <>
        <div className="project-context"><span>{project.project_no}</span><strong>{project.name}</strong><small>{project.department_name}</small></div>
        <form className="form-stack" onSubmit={submit}><ErrorNotice message={error} />
          <div className="form-grid">
            <label>{lang === "en" ? "Your name" : "Nama anda"}<input name="reporterName" required minLength={2} /></label>
            <label>{lang === "en" ? "Department" : "Jabatan"}<select name="department" defaultValue="" required><option value="" disabled>{lang === "en" ? "Select department" : "Pilih jabatan"}</option><option value="Production">Production</option><option value="Quality">Quality</option><option value="Logistic">Logistic</option><option value="Others">{lang === "en" ? "Others" : "Lain-lain"}</option></select></label>
            <label>{lang === "en" ? "Email (optional)" : "E-mel (pilihan)"}<input name="email" type="email" placeholder="name@example.com" /></label>
            <label>{lang === "en" ? "Phone (optional)" : "Telefon (pilihan)"}<input name="phone" /></label>
          </div>
          <label>{lang === "en" ? "Issue title" : "Tajuk isu"}<input name="title" required minLength={3} placeholder={lang === "en" ? "Short summary of the problem" : "Ringkasan masalah"} /></label>
          <label>{lang === "en" ? "What happened?" : "Apa yang berlaku?"}<textarea name="description" required minLength={10} rows={6} placeholder={lang === "en" ? "What were you doing, what did you expect, and what happened instead?" : "Apa yang anda lakukan, apakah yang dijangka, dan apa yang berlaku?"} /></label>
          <div className="form-grid"><label>{lang === "en" ? "Urgency" : "Keutamaan"}<select name="urgency" defaultValue="medium"><option value="low">Low / Rendah</option><option value="medium">Medium / Sederhana</option><option value="high">High / Tinggi</option><option value="critical">Critical / Kritikal</option></select></label><label>{lang === "en" ? "Photos or PDF (max 3)" : "Foto atau PDF (maks 3)"}<input name="attachments" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple /></label></div>
          <TurnstileField />
          <button className="button button-primary button-large" disabled={busy}>{busy ? "Sending…" : lang === "en" ? "Submit issue report" : "Hantar laporan isu"}</button>
        </form>
      </>}
    </section>
  </main>}</PublicShell>;
}

export function PublicRequestPage() {
  const { lang } = useI18n();
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
      <h1>{lang === "en" ? "Turn a better way of working into reality." : "Jadikan cara kerja yang lebih baik satu realiti."}</h1>
      <p>{lang === "en" ? "Share the challenge, the outcome you imagine, and any supporting material. DTU will review feasibility, impact, priority, and the best next step." : "Kongsikan cabaran, hasil yang dibayangkan dan bahan sokongan. DTU akan menyemak kebolehlaksanaan, impak, keutamaan dan langkah terbaik seterusnya."}</p>
      <div className="proposal-benefits"><span><b>01</b>{lang === "en" ? "Describe the need" : "Terangkan keperluan"}</span><span><b>02</b>{lang === "en" ? "Attach evidence" : "Lampirkan bukti"}</span><span><b>03</b>{lang === "en" ? "Track the review" : "Jejak semakan"}</span></div>
    </section>
    <section className="public-card proposal-card">
      <div className="proposal-card-head"><span>New proposal</span><h2>{lang === "en" ? "Tell us what should change" : "Beritahu kami perkara yang perlu berubah"}</h2><p>{lang === "en" ? "Required fields are marked with an asterisk." : "Medan wajib ditandakan dengan asterisk."}</p></div>
      <form className="form-stack proposal-form" onSubmit={submit} encType="multipart/form-data"><ErrorNotice message={error} />
        <div className="proposal-section"><div className="proposal-section-title"><b>01</b><div><strong>{lang === "en" ? "Proposal overview" : "Gambaran cadangan"}</strong><small>{lang === "en" ? "Give your idea a clear, memorable title." : "Berikan idea anda tajuk yang jelas."}</small></div></div>
          <label>{lang === "en" ? "Request title *" : "Tajuk permohonan *"}<input name="title" required minLength={3} placeholder={lang === "en" ? "e.g. Digital production handover" : "cth. Penyerahan pengeluaran digital"} /></label>
        </div>
        <div className="proposal-section"><div className="proposal-section-title"><b>02</b><div><strong>{lang === "en" ? "Your details" : "Butiran anda"}</strong><small>{lang === "en" ? "So the DTU team can follow up with you." : "Supaya pasukan DTU boleh menghubungi anda."}</small></div></div>
          <div className="form-grid"><label>{lang === "en" ? "Your name *" : "Nama anda *"}<input name="requesterName" required /></label><label>{lang === "en" ? "Department *" : "Jabatan *"}<input name="department" required /></label><label>Email *<input name="email" type="email" required placeholder="name@sugihara.com" /></label><label>{lang === "en" ? "Phone (optional)" : "Telefon (pilihan)"}<input name="phone" /></label></div>
        </div>
        <div className="proposal-section"><div className="proposal-section-title"><b>03</b><div><strong>{lang === "en" ? "Business need" : "Keperluan perniagaan"}</strong><small>{lang === "en" ? "Help us understand the problem and the result you need." : "Bantu kami memahami masalah dan hasil yang diperlukan."}</small></div></div>
          <label>{lang === "en" ? "What is the current problem? *" : "Apakah masalah semasa? *"}<textarea name="currentProblem" rows={5} required minLength={10} placeholder={lang === "en" ? "Describe the current process, pain points, and who is affected…" : "Terangkan proses semasa, masalah dan siapa yang terjejas…"} /></label>
          <label>{lang === "en" ? "What outcome do you need? *" : "Apakah hasil yang diperlukan? *"}<textarea name="desiredOutcome" rows={5} required minLength={10} placeholder={lang === "en" ? "Describe what success would look like…" : "Terangkan rupa kejayaan yang diharapkan…"} /></label>
          <div className="form-grid proposal-facts"><label>{lang === "en" ? "Expected users" : "Anggaran pengguna"}<input name="expectedUsers" type="number" min="1" /></label><label>{lang === "en" ? "Urgency" : "Keutamaan"}<select name="urgency" defaultValue="medium"><option value="low">Low / Rendah</option><option value="medium">Medium / Sederhana</option><option value="high">High / Tinggi</option><option value="critical">Critical / Kritikal</option></select></label><label>{lang === "en" ? "Desired target date" : "Tarikh sasaran"}<input name="targetDate" type="date" /></label></div>
        </div>
        <div className="proposal-section"><div className="proposal-section-title"><b>04</b><div><strong>{lang === "en" ? "Supporting documents" : "Dokumen sokongan"}</strong><small>{lang === "en" ? "Add your proposal, process map, spreadsheet, presentation, or pictures." : "Tambah cadangan, peta proses, hamparan, pembentangan atau gambar."}</small></div></div>
          <label className="proposal-upload"><input name="attachments" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp" multiple onChange={event => setFiles(Array.from(event.target.files ?? []))} /><span className="proposal-upload-icon">↥</span><strong>{lang === "en" ? "Drop files here or click to browse" : "Lepaskan fail di sini atau klik untuk memilih"}</strong><small>PDF, Word, Excel, PowerPoint, TXT, CSV or images · max 5 files · 10 MB each</small></label>
          {files.length > 0 && <div className="proposal-file-list">{files.map(file => <span key={`${file.name}-${file.lastModified}`}><b>✓</b><span>{file.name}</span><small>{file.size < 1024 * 1024 ? `${Math.ceil(file.size / 1024)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}</small></span>)}</div>}
        </div>
        <TurnstileField />
        <div className="proposal-submit"><div><strong>{lang === "en" ? "Ready for DTU review?" : "Sedia untuk semakan DTU?"}</strong><small>{lang === "en" ? "You’ll receive a private tracking link after submission." : "Anda akan menerima pautan penjejakan peribadi selepas dihantar."}</small></div><button className="button button-primary button-large" disabled={busy}>{busy ? "Sending…" : lang === "en" ? "Submit proposal →" : "Hantar cadangan →"}</button></div>
      </form>
    </section>
  </main>}</PublicShell>;
}

export function TrackingPage() {
  const { token } = useParams();
  const { lang } = useI18n();
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
      <div className="tracking-project-heading"><div><span className="eyebrow">Approved project</span><h3>{lang === "en" ? "Delivery progress" : "Kemajuan pelaksanaan"}</h3></div><strong>{data.item.project_progress}%</strong></div>
      <div className="bar"><i style={{ width: `${data.item.project_progress}%` }} /></div>
      {data.item.project_current_update && <div className="tracking-project-update"><small>{lang === "en" ? "Latest update from DTU" : "Kemas kini terkini daripada DTU"}</small><p>{data.item.project_current_update}</p></div>}
      {data.item.project_next_action && <div className="tracking-project-update"><small>{lang === "en" ? "What happens next" : "Langkah seterusnya"}</small><p>{data.item.project_next_action}</p></div>}
      {data.item.handover_url && <a className="button button-primary" href={data.item.handover_url} target="_blank" rel="noreferrer">{lang === "en" ? "Open project handover" : "Buka penyerahan projek"}</a>}
    </section>}
    <section className="tracking-grid"><div className="public-card"><h3>{lang === "en" ? "Request stage" : "Peringkat permohonan"}</h3><div className="tracking-statuses">{(data.kind === "issue" ? ["new","triaged","assigned","in_progress","waiting","resolved","closed"] : ["submitted","triage","needs_information","approved"]).map((s: string) => <div className={s === data.item.status ? "current" : ""} key={s}><i />{humanize(s)}</div>)}</div><div className="tracking-meta"><span><small>{lang === "en" ? "Submitted" : "Dihantar"}</small>{formatDate(data.item.created_at, true)}</span><span><small>{lang === "en" ? "Last update" : "Kemas kini"}</small>{formatDate(data.item.project_progress_updated_at || data.item.updated_at, true)}</span></div></div>
      <div className="public-card"><h3>{lang === "en" ? "Updates from DTU" : "Kemas kini DTU"}</h3>{data.comments.length ? <div className="comment-list">{data.comments.map((c: any) => <article className="comment" key={c.id}><div className="avatar">{c.author_name[0]}</div><div><div><strong>{c.author_name}</strong><span>{formatDate(c.created_at, true)}</span></div><p>{c.body}</p></div></article>)}</div> : <Empty title={lang === "en" ? "No updates yet" : "Belum ada kemas kini"} />}
        {data.attachments?.length > 0 && <div className="attachment-list">{data.attachments.map((a: any) => <a href={`/api/public/attachments/${a.id}/${token}`} key={a.id}>📎 {a.original_name}</a>)}</div>}
        <div className="public-reply"><ErrorNotice message={error} /><input placeholder={lang === "en" ? "Your name" : "Nama anda"} value={name} onChange={e => setName(e.target.value)} /><textarea rows={3} placeholder={lang === "en" ? "Reply to DTU…" : "Balas kepada DTU…"} value={reply} onChange={e => setReply(e.target.value)} /><button className="button button-primary" onClick={() => void send()} disabled={!name.trim() || !reply.trim()}>{lang === "en" ? "Send reply" : "Hantar balasan"}</button></div>
      </div></section>
  </>}</main></PublicShell>;
}
