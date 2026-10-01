import { useEffect, useState, type FormEvent } from "react";
import { api, json } from "../api";
import { useAuth } from "../auth";
import { ErrorNotice, PageHeader, PasswordInput } from "../components/UI";
import { useI18n } from "../i18n";

export function ProfilePage() {
  const { user, refresh } = useAuth();
  const { setLang } = useI18n();
  const [form, setForm] = useState({ name: user?.name || "", email: user?.email || "", language: user?.language || "en" });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  useEffect(() => {
    if (user) setForm({ name: user.name, email: user.email || "", language: user.language });
  }, [user?.id, user?.name, user?.email, user?.language]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setError(""); setSaved(false); setSaving(true);
    try {
      await api("/api/staff/profile", json("PATCH", { ...form, email: form.email.trim() || null }));
      await refresh();
      setLang(form.language);
      setSaved(true);
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };
  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError(""); setPasswordSaved(false);
    if (passwords.newPassword !== passwords.confirm) return setPasswordError("New passwords do not match");
    setPasswordSaving(true);
    try {
      await api("/api/auth/password", json("POST", { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword }));
      setPasswords({ currentPassword: "", newPassword: "", confirm: "" });
      setPasswordSaved(true);
    } catch (err) { setPasswordError((err as Error).message); }
    finally { setPasswordSaving(false); }
  };

  return <>
    <PageHeader eyebrow="Your account" title="Profile" description="Keep your contact details current and update your password." />
    <div className="profile-grid">
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">Contact details</span><h2>Edit profile</h2></div></div>
        <form className="form-stack" onSubmit={saveProfile}>
          <ErrorNotice message={error} />
          {saved && <div className="notice notice-success" role="status">Profile saved.</div>}
          <label>Username<input value={user?.username || ""} disabled /><small>Ask an administrator to change your username.</small></label>
          <label>Full name<input required minLength={2} maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
          <label>Email<input type="email" maxLength={254} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /><small>Notifications sent by email will use this address.</small></label>
          <label>Language<select value={form.language} onChange={event => setForm({ ...form, language: event.target.value as "en" | "ms" })}><option value="en">English</option><option value="ms">Bahasa Melayu</option></select></label>
          <button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">Security</span><h2>Change password</h2></div></div>
        <form className="form-stack" onSubmit={savePassword}>
          <ErrorNotice message={passwordError} />
          {passwordSaved && <div className="notice notice-success" role="status">Password changed.</div>}
          <label>Current password<PasswordInput required autoComplete="current-password" value={passwords.currentPassword} onChange={event => setPasswords({ ...passwords, currentPassword: event.target.value })} /></label>
          <label>New password<PasswordInput required minLength={12} autoComplete="new-password" value={passwords.newPassword} onChange={event => setPasswords({ ...passwords, newPassword: event.target.value })} /><small>At least 12 characters with upper, lower, and numeric characters.</small></label>
          <label>Confirm new password<PasswordInput required autoComplete="new-password" value={passwords.confirm} onChange={event => setPasswords({ ...passwords, confirm: event.target.value })} /></label>
          <button className="button button-secondary" disabled={passwordSaving}>{passwordSaving ? "Changing…" : "Change password"}</button>
        </form>
      </section>
    </div>
  </>;
}
