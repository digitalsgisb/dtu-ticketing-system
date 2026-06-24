import { useEffect, useState, type FormEvent } from "react";
import { api, json } from "../api";
import { useAuth } from "../auth";
import { Badge, ErrorNotice, Loading, Modal, PageHeader } from "../components/UI";

export function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[] | null>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [storage, setStorage] = useState<any>(null);
  const [tab, setTab] = useState("users");
  const load = () => {
    void api<any[]>("/api/staff/users").then(setUsers);
    void api<any[]>("/api/staff/departments").then(setDepartments);
    void api("/api/staff/system/storage").then(setStorage);
  };
  useEffect(load, []);
  if (!users) return <Loading />;
  return <>
    <PageHeader eyebrow="System management" title="Administration" description="Manage access, organization data, imports, and deployment health." />
    <div className="tabs">
      <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>Users</button>
      <button className={tab === "departments" ? "active" : ""} onClick={() => setTab("departments")}>Departments</button>
      <button className={tab === "imports" ? "active" : ""} onClick={() => setTab("imports")}>CSV Import</button>
      <button className={tab === "system" ? "active" : ""} onClick={() => setTab("system")}>System</button>
    </div>
    {tab === "users" && <UsersPanel users={users} currentUserId={user?.id ?? 0} onChanged={load} />}
    {tab === "departments" && <DepartmentsPanel departments={departments} onCreated={load} />}
    {tab === "imports" && <ImportPanel />}
    {tab === "system" && <SystemPanel storage={storage} />}
  </>;
}

function UsersPanel({ users, currentUserId, onChanged }: { users: any[]; currentUserId: number; onChanged: () => void }) {
  const [form, setForm] = useState({ username: "", name: "", email: "", role: "member", language: "en", password: "" });
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await api("/api/staff/users", json("POST", { ...form, email: form.email || null }));
      setForm({ username: "", name: "", email: "", role: "member", language: "en", password: "" });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return <>
    <div className="admin-grid">
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">Team</span><h2>Staff accounts</h2></div></div>
        <div className="user-list">
          {users.map(user => <div key={user.id} className={!user.active ? "is-inactive" : ""}>
            <div className="avatar">{user.name.split(" ").map((part: string) => part[0]).slice(0, 2).join("")}</div>
            <div><strong>{user.name}</strong><span>@{user.username} · {user.email || "No email"}</span></div>
            <div className="user-actions">
              <Badge value={user.active ? user.role : "inactive"} kind="type" />
              <button className="button button-secondary button-compact" onClick={() => setSelected(user)}>Manage</button>
            </div>
          </div>)}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">Provisioning</span><h2>Add staff account</h2></div></div>
        <form className="form-stack" onSubmit={submit}>
          <ErrorNotice message={error} />
          <label>Full name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
          <label>Username<input required value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} /></label>
          <label>Email<input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
          <div className="form-grid">
            <label>Role<select value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}><option>member</option><option>lead</option><option>admin</option></select></label>
            <label>Language<select value={form.language} onChange={event => setForm({ ...form, language: event.target.value })}><option value="en">English</option><option value="ms">Bahasa Melayu</option></select></label>
          </div>
          <label>Temporary password<input type="password" required minLength={12} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /><small>At least 12 characters with upper, lower, and numeric characters. User must change it after first sign-in.</small></label>
          <button className="button button-primary">Create account</button>
        </form>
      </section>
    </div>
    {selected && <UserEditor user={selected} isCurrentUser={selected.id === currentUserId} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); onChanged(); }} />}
  </>;
}

function UserEditor({ user, isCurrentUser, onClose, onSaved }: { user: any; isCurrentUser: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: user.name, email: user.email || "", role: user.role, language: user.language, active: Boolean(user.active) });
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [message, setMessage] = useState("");
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await api(`/api/staff/users/${user.id}`, json("PATCH", { ...form, email: form.email || null }));
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const resetPassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError("");
    setMessage("");
    try {
      await api(`/api/staff/users/${user.id}/reset-password`, json("POST", { password }));
      setPassword("");
      setMessage("Temporary password saved. Existing sessions were signed out.");
    } catch (err) {
      setPasswordError((err as Error).message);
    }
  };
  return <Modal title={`Manage ${user.name}`} onClose={onClose}>
    <form className="form-stack" onSubmit={save}>
      <ErrorNotice message={error} />
      <label>Full name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
      <label>Email<input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
      <div className="form-grid">
        <label>Role<select disabled={isCurrentUser} value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}><option>member</option><option>lead</option><option>admin</option></select></label>
        <label>Language<select value={form.language} onChange={event => setForm({ ...form, language: event.target.value })}><option value="en">English</option><option value="ms">Bahasa Melayu</option></select></label>
      </div>
      <label className="checkbox-row"><input type="checkbox" disabled={isCurrentUser} checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} /><span>Account active</span></label>
      {isCurrentUser && <small className="muted">For safety, you cannot disable your own account or change your own role here.</small>}
      <button className="button button-primary">Save account</button>
    </form>
    <div className="modal-divider" />
    <form className="form-stack" onSubmit={resetPassword}>
      <h3>Reset password</h3>
      <ErrorNotice message={passwordError} />
      {message && <div className="notice notice-success">{message}</div>}
      <label>New temporary password<input type="password" required minLength={12} value={password} onChange={event => setPassword(event.target.value)} /><small>At least 12 characters with upper, lower, and numeric characters.</small></label>
      <button className="button button-secondary">Reset and sign out user</button>
    </form>
  </Modal>;
}

function DepartmentsPanel({ departments, onCreated }: { departments: any[]; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api("/api/staff/departments", json("POST", { name, code }));
      setName("");
      setCode("");
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return <div className="admin-grid">
    <section className="panel"><div className="panel-heading"><h2>Departments</h2></div><div className="department-list">{departments.map(department => <div key={department.id}><strong>{department.code}</strong><span>{department.name}</span></div>)}</div></section>
    <section className="panel"><div className="panel-heading"><h2>Add department</h2></div><form className="form-stack" onSubmit={submit}><ErrorNotice message={error} /><label>Department name<input required value={name} onChange={event => setName(event.target.value)} /></label><label>Short code<input required maxLength={20} value={code} onChange={event => setCode(event.target.value)} /></label><button className="button button-primary">Add department</button></form></section>
  </div>;
}

function ImportPanel() {
  const [kind, setKind] = useState("projects");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState("");
  const upload = async () => {
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    try {
      setPreview(await api(`/api/staff/imports/preview/${kind}`, { method: "POST", body }));
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const commit = async () => {
    await api(`/api/staff/imports/commit/${preview.token}`, json("POST"));
    setPreview({ ...preview, committed: true });
  };
  return <section className="panel">
    <div className="panel-heading"><div><span className="eyebrow">Backlog migration</span><h2>Preview and import CSV</h2></div></div>
    <ErrorNotice message={error} />
    <div className="import-controls"><select value={kind} onChange={event => { setKind(event.target.value); setPreview(null); }}><option value="projects">Projects</option><option value="tickets">Tickets</option></select><a className="button button-secondary" href={`/api/staff/imports/templates/${kind}`}>Download template</a><input type="file" accept=".csv,text/csv" onChange={event => setFile(event.target.files?.[0] || null)} /><button className="button button-primary" onClick={() => void upload()} disabled={!file}>Preview file</button></div>
    {preview && <div className="import-preview"><h3>{preview.validRows} of {preview.totalRows} valid rows</h3>{preview.errors.length > 0 ? <div className="notice notice-error">{preview.errors.map((error: any) => <div key={error.row}>Row {error.row}: {error.message}</div>)}</div> : <><pre>{JSON.stringify(preview.preview, null, 2)}</pre>{preview.committed ? <div className="notice notice-success">Import completed successfully.</div> : <button className="button button-primary" onClick={() => void commit()}>Commit {preview.validRows} rows</button>}</>}</div>}
  </section>;
}

function SystemPanel({ storage }: { storage: any }) {
  const [recipient, setRecipient] = useState("");
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!storage) return <Loading />;
  const percent = Math.round((storage.freeBytes / storage.totalBytes) * 100);
  const testEmail = async (event: FormEvent) => {
    event.preventDefault();
    setTesting(true);
    setMessage("");
    setError("");
    try {
      await api("/api/staff/system/email/test", json("POST", { recipient }));
      setMessage(`Test email sent to ${recipient}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTesting(false);
    }
  };
  return <div className="admin-grid">
    <section className="panel"><div className="panel-heading"><h2>Storage health</h2></div><div className="system-meter"><strong>{percent}% free</strong><div className="bar"><i style={{ width: `${percent}%` }} /></div><span>{(storage.freeBytes / 1024 ** 3).toFixed(1)} GB available of {(storage.totalBytes / 1024 ** 3).toFixed(1)} GB</span></div></section>
    <section className="panel"><div className="panel-heading"><h2>Integrations</h2></div>
      <div className="integration-row"><div><strong>SMTP email</strong><span>{storage.smtpConfigured ? `${storage.smtp.host}:${storage.smtp.port} · ${storage.smtp.secure ? "TLS" : "STARTTLS"} · ${storage.smtp.from}` : "Add SMTP settings to the server environment"}</span></div><Badge value={storage.smtpConfigured ? "configured" : "not_configured"} kind="type" /></div>
      {storage.smtpConfigured && <form className="email-test-form" onSubmit={testEmail}>
        <label>Send a test email<input type="email" required placeholder="name@company.com" value={recipient} onChange={event => setRecipient(event.target.value)} /></label>
        <button className="button button-secondary" disabled={testing}>{testing ? "Testing…" : "Send test"}</button>
        <ErrorNotice message={error} />{message && <div className="notice notice-success">{message}</div>}
      </form>}
      <div className="integration-row"><div><strong>Encrypted backups</strong><span>{storage.latestLocalBackup ? `Latest local: ${storage.latestLocalBackup}` : "No local encrypted backup found"}</span></div><Badge value={storage.backupConfigured ? "configured" : "not_configured"} kind="type" /></div>
      <div className="integration-row"><div><strong>Cloudflare R2</strong><span>{storage.r2Configured ? "Off-site backup credentials configured" : "Add R2 credentials to the server environment"}</span></div><Badge value={storage.r2Configured ? "configured" : "not_configured"} kind="type" /></div>
    </section>
  </div>;
}
