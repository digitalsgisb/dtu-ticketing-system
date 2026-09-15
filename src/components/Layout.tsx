import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useAuth, type User } from "../auth";
import { useI18n } from "../i18n";
import { BellIcon, GridIcon, LinkIcon, PresentationIcon, ProjectIcon, RequestIcon, ScreenIcon, SettingsIcon, TicketIcon } from "./Icons";
import { api, json } from "../api";
import { ErrorNotice, Modal, PasswordInput } from "./UI";
import { CompanyLogo } from "./CompanyLogo";
import { showDeviceNotification, usePwa } from "../pwa";
import { useLiveRefresh } from "../live";

type NavItem = readonly [to: string, label: string, icon: ReactNode];
type NotificationSummary = {
  unreadCount: number;
  latestUnread?: Array<{ id: number; title: string; body: string; link: string | null }>;
};

const roleNames: Record<User["role"], string> = {
  admin: "Administrator",
  lead: "Team Lead",
  member: "Team Member"
};

export function Layout() {
  const { user, logout, mustChangePassword, refresh } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { canInstall, install, isOnline } = usePwa();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const projectSectionActive = location.pathname.startsWith("/projects") || location.pathname.startsWith("/my-projects");
  const [projectsOpen, setProjectsOpen] = useState(projectSectionActive);

  useEffect(() => {
    const loadUnread = () => {
      void api<NotificationSummary>("/api/staff/notifications/summary")
        .then(result => {
          setUnreadCount(result.unreadCount);
          if (!user || !result.latestUnread?.length) return;
          const key = `dtu-last-device-notification-${user.id}`;
          const newestId = Math.max(...result.latestUnread.map(item => item.id));
          const stored = localStorage.getItem(key);
          if (stored === null) {
            localStorage.setItem(key, String(newestId));
            return;
          }
          const lastId = Number(stored) || 0;
          const enabled = localStorage.getItem("dtu-device-notifications") === "enabled";
          if (enabled && "Notification" in window && Notification.permission === "granted") {
            result.latestUnread
              .filter(item => item.id > lastId)
              .reverse()
              .forEach(item => void showDeviceNotification(item.title, {
                body: item.body,
                tag: `dtu-notification-${item.id}`,
                data: { url: item.link || "/notifications" }
              }));
          }
          localStorage.setItem(key, String(Math.max(lastId, newestId)));
        })
        .catch(() => undefined);
    };
    loadUnread();
    const interval = window.setInterval(loadUnread, 30_000);
    window.addEventListener("notifications-changed", loadUnread);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("notifications-changed", loadUnread);
    };
  }, [user]);
  useLiveRefresh(() => window.dispatchEvent(new Event("notifications-changed")));

  useEffect(() => {
    setMobileOpen(false);
    void api<NotificationSummary>("/api/staff/notifications/summary")
      .then(result => setUnreadCount(result.unreadCount))
      .catch(() => undefined);
  }, [location.pathname]);

  useEffect(() => {
    if (projectSectionActive) setProjectsOpen(true);
  }, [projectSectionActive]);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.body.classList.add("nav-open");
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.classList.remove("nav-open");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);

  const items: NavItem[] = [
    ["/", t("dashboard"), <GridIcon key="grid" />],
    ["/tickets", t("tickets"), <TicketIcon key="ticket" />],
    ...(user?.role !== "member" ? [["/requests", t("requests"), <RequestIcon key="request" />] as NavItem] : []),
    ...(user?.role !== "member" ? [["/briefing", t("briefing"), <PresentationIcon key="briefing" />] as NavItem] : []),
    ...(user?.role !== "member" ? [["/showcase", "Guest showcase", <ScreenIcon key="showcase" />] as NavItem] : []),
    ["/links", t("systemLinks"), <LinkIcon key="links" />],
    ...(user?.role === "admin" ? [["/admin", t("admin"), <SettingsIcon key="settings" />] as NavItem] : [])
  ];
  const currentSection = location.pathname.startsWith("/notifications")
    ? "Notifications"
    : projectSectionActive
      ? t("projects")
      : items.find(([to]) => to === "/" ? location.pathname === "/" : location.pathname.startsWith(to))?.[1] ?? t("dashboard");
  const today = new Intl.DateTimeFormat(lang === "ms" ? "ms-MY" : "en-MY", { weekday: "short", day: "2-digit", month: "short" }).format(new Date());

  return (
    <div className="app-shell">
      <button className={`nav-scrim ${mobileOpen ? "is-visible" : ""}`} aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`} aria-label="Main navigation">
        <div className="sidebar-glow" />
        <div className="sidebar-brand-row">
          <div className="brand company-brand sidebar-brand">
            <CompanyLogo />
            <small>DTU Control Centre</small>
          </div>
          <button className="sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation">×</button>
        </div>
        <div className="sidebar-workspace">
          <span className="sidebar-section-label">{roleNames[user?.role ?? "member"]} workspace</span>
          <nav>
            <div className={`nav-group ${projectsOpen ? "is-open" : ""}`}>
              <button type="button" className={`nav-group-trigger ${projectSectionActive ? "active" : ""}`} onClick={() => setProjectsOpen(open => !open)} aria-expanded={projectsOpen}>
                <ProjectIcon /><span>{t("projects")}</span><i />
              </button>
              <div className="nav-subnav" aria-hidden={!projectsOpen}>
                <NavLink to="/my-projects" tabIndex={projectsOpen ? undefined : -1} onClick={() => setMobileOpen(false)}>{t("myProjects")}</NavLink>
                <NavLink to="/projects" tabIndex={projectsOpen ? undefined : -1} onClick={() => setMobileOpen(false)}>{t("allProjects")}</NavLink>
              </div>
            </div>
            {items.map(([to, label, icon]) => (
              <NavLink key={to} to={to} end={to === "/"} onClick={() => setMobileOpen(false)}>
                {icon}<span>{label}</span>
              </NavLink>
            ))}
            <NavLink to="/notifications" onClick={() => setMobileOpen(false)}><BellIcon /><span>Notifications</span>{unreadCount > 0 && <b className="nav-notification-count">{unreadCount > 99 ? "99+" : unreadCount}</b>}</NavLink>
            <NavLink to="/wallboard" target="_blank" onClick={() => setMobileOpen(false)}><ScreenIcon /><span>{t("wallboard")}</span></NavLink>
          </nav>
        </div>
        <div className="sidebar-footer">
          <div className="user-card">
            <div className="avatar">{user?.name.split(" ").map(s => s[0]).slice(0, 2).join("")}</div>
            <div><strong>{user?.name}</strong><small>{roleNames[user?.role ?? "member"]}</small></div>
          </div>
          <button className="sidebar-action" onClick={() => { void logout().then(() => navigate("/login")); }}>{t("signOut")}</button>
        </div>
      </aside>
      <main className="main-area">
        {!isOnline && <div className="offline-banner" role="status"><span />You are offline. Saved screens remain available; changes will work again after reconnecting.</div>}
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation" aria-expanded={mobileOpen}>☰</button>
          <div className="topbar-context">
            <span className="topbar-section">Operations</span><i>/</i><strong>{currentSection}</strong>
          </div>
          <strong className="mobile-section-title">{currentSection}</strong>
          <div className="topbar-actions">
            <div className="system-status"><span className="status-dot" /><span>Systems nominal</span></div>
            <time>{today}</time>
            {canInstall && <button className="install-button" onClick={() => void install()}>Install app</button>}
            <button className="language-button" onClick={() => setLang(lang === "en" ? "ms" : "en")}>{t("language")}</button>
            <button className="icon-button notification-button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} onClick={() => navigate("/notifications")}>
              <BellIcon />
              {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </button>
          </div>
        </header>
        <div className="content"><Outlet /></div>
      </main>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <NavLink to="/" end><GridIcon /><span>Home</span></NavLink>
        <NavLink to="/my-projects"><ProjectIcon /><span>Projects</span></NavLink>
        <NavLink to="/tickets"><TicketIcon /><span>Work</span></NavLink>
        <button className={mobileOpen ? "active" : ""} onClick={() => setMobileOpen(true)}><span className="more-icon" aria-hidden="true">•••</span><span>More</span></button>
      </nav>
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
      <label>Temporary password<PasswordInput autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></label>
      <label>New password<PasswordInput autoComplete="new-password" required minLength={12} value={newPassword} onChange={e => setNewPassword(e.target.value)} /><small>At least 12 characters with upper, lower, and numeric characters.</small></label>
      <label>Confirm new password<PasswordInput autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
      <button className="button button-primary button-large">Save password</button>
    </form>
  </Modal>;
}
