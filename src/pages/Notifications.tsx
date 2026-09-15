import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { Empty, Loading, PageHeader } from "../components/UI";
import { showDeviceNotification, usePwa } from "../pwa";
import { useLiveRefresh } from "../live";

type DeviceNotificationState = "unsupported" | "blocked" | "off" | "on";

export function NotificationsPage() {
  const { canInstall, install, isInstalled } = usePwa();
  const [items, setItems] = useState<any[] | null>(null);
  const [deviceState, setDeviceState] = useState<DeviceNotificationState>(() => getDeviceNotificationState());
  const load = () => api<any[]>("/api/staff/notifications").then(setItems);
  useEffect(() => { void load(); }, []);
  useLiveRefresh(load);
  if (!items) return <Loading />;
  const unreadCount = items.filter(item => !item.read_at).length;
  const markRead = (id: number) => {
    setItems(current => current?.map(item => item.id === id ? { ...item, read_at: new Date().toISOString() } : item) ?? null);
    window.dispatchEvent(new Event("notifications-changed"));
    void api(`/api/staff/notifications/${id}/read`, json("POST"));
  };
  const markAllRead = async () => {
    await api("/api/staff/notifications/read-all", json("POST"));
    setItems(current => current?.map(item => ({ ...item, read_at: item.read_at || new Date().toISOString() })) ?? null);
    window.dispatchEvent(new Event("notifications-changed"));
  };
  const enableDeviceNotifications = async () => {
    if (!("Notification" in window)) return setDeviceState("unsupported");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      localStorage.removeItem("dtu-device-notifications");
      return setDeviceState(permission === "denied" ? "blocked" : "off");
    }
    localStorage.setItem("dtu-device-notifications", "enabled");
    setDeviceState("on");
    window.dispatchEvent(new Event("notifications-changed"));
    await showDeviceNotification("DTU notifications are on", {
      body: "Assignments, replies and deadline alerts can now appear on this device.",
      tag: "dtu-notifications-enabled",
      data: { url: "/notifications" }
    });
  };
  const disableDeviceNotifications = () => {
    localStorage.removeItem("dtu-device-notifications");
    setDeviceState("off");
  };
  return <>
    <PageHeader eyebrow="Attention feed" title="Notifications" description="Assignments, deadlines, submissions, and replies that need your attention."
      actions={unreadCount > 0 && <button className="button button-secondary" onClick={() => void markAllRead()}>Mark all as read</button>} />
    <section className="notification-preferences" aria-labelledby="device-notification-heading">
      <div className="notification-preference-icon" aria-hidden="true">🔔</div>
      <div>
        <span className="eyebrow">This device</span>
        <h2 id="device-notification-heading">Device notifications</h2>
        <p>{deviceNotificationMessage(deviceState, isInstalled)}</p>
      </div>
      <div className="notification-preference-actions">
        {deviceState === "on"
          ? <button className="button button-secondary" onClick={disableDeviceNotifications}>Turn off</button>
          : deviceState !== "unsupported" && deviceState !== "blocked" && <button className="button button-primary" onClick={() => void enableDeviceNotifications()}>Enable notifications</button>}
        {canInstall && <button className="button button-secondary" onClick={() => void install()}>Install app</button>}
      </div>
    </section>
    {items.length ? <section className="panel notification-list">{items.map(item =>
      <Link to={item.link || "#"} key={item.id} className={item.read_at ? "" : "unread"} onClick={() => markRead(item.id)}>
        <i /><div><strong>{item.title}</strong><p>{item.body}</p><small>{formatDate(item.created_at, true)}</small></div>
      </Link>)}</section> : <Empty title="You are all caught up" />}
  </>;
}

function getDeviceNotificationState(): DeviceNotificationState {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" && localStorage.getItem("dtu-device-notifications") === "enabled" ? "on" : "off";
}

function deviceNotificationMessage(state: DeviceNotificationState, isInstalled: boolean) {
  if (state === "unsupported") return "This browser does not support device notifications. Your in-app feed will still update normally.";
  if (state === "blocked") return "Notifications are blocked in your browser settings. Allow them for this site, then return here.";
  if (state === "on") return `Alerts are enabled${isInstalled ? " for the installed app" : " in this browser"}. Keep the app signed in to receive live updates.`;
  return "Turn on alerts for new assignments, comments, public replies, and approaching deadlines.";
}
