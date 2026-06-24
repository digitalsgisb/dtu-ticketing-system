import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ErrorNotice } from "../components/UI";
import { useI18n } from "../i18n";
import { CompanyLogo } from "../components/CompanyLogo";

export function LoginPage() {
  const { login } = useAuth();
  const { lang, setLang } = useI18n();
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
          <h1>{lang === "en" ? "Make every request visible." : "Jadikan setiap permohonan kelihatan."}</h1>
          <p>{lang === "en" ? "One calm place for projects, service issues, deadlines, and the work that moves your organization forward." : "Satu pusat untuk projek, isu perkhidmatan, tarikh akhir dan kerja yang menggerakkan organisasi anda."}</p>
          <div className="login-metrics"><div><strong>01</strong><span>Intake</span></div><div><strong>02</strong><span>Triage</span></div><div><strong>03</strong><span>Action</span></div></div>
        </div>
      </div>
      <div className="login-panel">
        <button className="language-button login-language" onClick={() => setLang(lang === "en" ? "ms" : "en")}>{lang === "en" ? "Bahasa Melayu" : "English"}</button>
        <form onSubmit={submit} className="login-form">
          <div className="eyebrow">{lang === "en" ? "Staff access" : "Akses kakitangan"}</div>
          <h2>{lang === "en" ? "Welcome back" : "Selamat kembali"}</h2>
          <p>{lang === "en" ? "Sign in to the DTU operations workspace." : "Log masuk ke ruang kerja operasi DTU."}</p>
          <ErrorNotice message={error} />
          <label>{lang === "en" ? "Username" : "Nama pengguna"}<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" /></label>
          <label>{lang === "en" ? "Password" : "Kata laluan"}<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" autoFocus /></label>
          <button className="button button-primary button-large" disabled={busy}>{busy ? "…" : lang === "en" ? "Enter control centre" : "Masuk pusat kawalan"}</button>
        </form>
      </div>
    </div>
  );
}
