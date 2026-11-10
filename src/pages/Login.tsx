import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ErrorNotice, PasswordInput } from "../components/UI";
import { CompanyLogo } from "../components/CompanyLogo";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setBusy(true);
    try { await login(username, password); navigate("/"); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="login-page">
      <div className="login-visual">
        <div className="login-grid" />
        <div className="login-copy">
          <CompanyLogo className="login-company-logo" />
          <div className="eyebrow">Digital Transformation Unit</div>
          <h1>Make every request visible.</h1>
          <p>One calm place for projects, service issues, deadlines, and the work that moves your organization forward.</p>
          <div className="login-metrics"><div><strong>01</strong><span>Intake</span></div><div><strong>02</strong><span>Triage</span></div><div><strong>03</strong><span>Action</span></div></div>
        </div>
      </div>
      <div className="login-panel">
        
        <form onSubmit={submit} className="login-form">
          <div className="eyebrow">Staff access</div>
          <h2>Welcome back</h2>
          <p>Sign in to the DTU operations workspace.</p>
          <ErrorNotice message={error} />
          <label>Username<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" /></label>
          <label>Password<PasswordInput value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" autoFocus /></label>
          <button className="button button-primary button-large" disabled={busy}>{busy ? "…" : "Enter control centre"}</button>
        </form>
      </div>
    </div>
  );
}
