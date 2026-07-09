import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { BellIcon, GridIcon, PresentationIcon, ProjectIcon, RequestIcon, ScreenIcon, SettingsIcon, TicketIcon } from "./Icons";
import { api, json } from "../api";
import { ErrorNotice, Modal } from "./UI";
import { CompanyLogo } from "./CompanyLogo";

export function Layout() {
  const { user, logout, mustChangePassword, refresh } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const loadUnread = () => {
      void api<{ unreadCount: number }>("/api/staff/notifications/summary")
        .then(result => setUnreadCount(result.unreadCount))
        .catch(() => undefined);
    };
    loadUnread();
    const interval = window.setInterval(loadUnread, 60_000);
    window.addEventListener("notifications-changed", loadUnread);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("notifications-changed", loadUnread);
    };
  }, []);

  useEffect(() => {
    void api<{ unreadCount: number }>("/api/staff/notifications/summary")
      .then(result => setUnreadCount(result.unreadCount))
      .catch(() => undefined);
  }, [location.pathname]);

  const items = [
    ["/", t("dashboard"), <GridIcon key="grid" />],
    ["/my-projects", t("myProjects"), <ProjectIcon key="my-project" />],
    ["/projects", t("projects"), <ProjectIcon key="project" />],
    ["/tickets", t("tickets"), <TicketIcon key="ticket" />],
    ["/requests", t("requests"), <RequestIcon key="request" />],
    ...(user?.role !== "member" ? [["/briefing", t("briefing"), <PresentationIcon key="briefing" />] as const] : []),
    ...(user?.role === "admin" ? [["/admin", t("admin"), <SettingsIcon key="settings" />] as const] : [])
  ] as const;
  const currentSection = location.pathname.startsWith("/notifications")
    ? "Notifications"
    : items.find(([to]) => to === "/" ? location.pathname === "/" : location.pathname.startsWith(to))?.[1] ?? t("dashboard");
  const today = new Intl.DateTimeFormat(lang === "ms" ? "ms-MY" : "en-MY", { weekday: "short", day: "2-digit", month: "short" }).format(new Date());

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="sidebar-glow" />
        <div className="brand company-brand sidebar-brand">
          <CompanyLogo />
          <small>DTU Control Centre</small>
        </div>
        <span className="sidebar-section-label">Workspace</span>
        <nav>
          {items.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === "/"} onClick={() => setMobileOpen(false)}>
              {icon}<span>{label}</span>
            </NavLink>
          ))}
          <NavLink to="/wallboard" target="_blank"><ScreenIcon /><span>{t("wallboard")}</span></NavLink>
        </nav>
        <div className="sidebar-footer">
          <div className="user-card">
            <div className="avatar">{user?.name.split(" ").map(s => s[0]).slice(0, 2).join("")}</div>
            <div><strong>{user?.name}</strong><small>{user?.role}</small></div>
          </div>
          <button className="sidebar-action" onClick={() => { void logout().then(() => navigate("/login")); }}>{t("signOut")}</button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(v => !v)}>☰</button>
          <div className="topbar-context">
            <span className="topbar-section">Operations</span><i>/</i><strong>{currentSection}</strong>
          </div>
          <div className="topbar-actions">
            <div className="system-status"><span className="status-dot" /><span>Systems nominal</span></div>
            <time>{today}</time>
            <button className="language-button" onClick={() => setLang(lang === "en" ? "ms" : "en")}>{t("language")}</button>
            <button className="icon-button notification-button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} onClick={() => navigate("/notifications")}>
              <BellIcon />
              {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </button>
          </div>
        </header>
        <div className="content"><Outlet /></div>
      </main>
      {mustChangePassword && <PasswordChange onChanged={() => void refresh()} />}
    </div>
  );
}

function PasswordChange({ onChanged }: { onChanged: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirm) return setError("New passwords do not match");
    try {
      await api("/api/auth/password", json("POST", { currentPassword, newPassword }));
      onChanged();
    } catch (e) { setError((e as Error).message); }
  };
  return <Modal title="Set your permanent password" onClose={() => undefined}>
    <form className="form-stack" onSubmit={submit}>
      <p className="muted">For security, replace the temporary password before using the control centre.</p>
      <ErrorNotice message={error} />
      <label>Temporary password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></label>
      <label>New password<input type="password" autoComplete="new-password" required minLength={12} value={newPassword} onChange={e => setNewPassword(e.target.value)} /><small>At least 12 characters with upper, lower, and numeric characters.</small></label>
      <label>Confirm new password<input type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
      <button className="button button-primary button-large">Save password</button>
    </form>
  </Modal>;
}
