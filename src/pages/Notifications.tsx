import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { Empty, Loading, PageHeader } from "../components/UI";
import { showDeviceNotification, usePwa } from "../pwa";
import { useLiveRefresh } from "../live";
import { useAuth } from "../auth";

type DeviceNotificationState = "unsupported" | "blocked" | "off" | "on";

export function NotificationsPage() {
  const { canInstall, install, isInstalled } = usePwa();
  const { user } = useAuth();
  const [items, setItems] = useState<any[] | null>(null);
  const [deviceState, setDeviceState] = useState<DeviceNotificationState>(() => getDeviceNotificationState());
  const [pushKey, setPushKey] = useState<string | null>(null);
  const [pushError, setPushError] = useState("");
  const load = () => api<any[]>("/api/staff/notifications").then(setItems);
  useEffect(() => { void load(); }, []);
  useEffect(() => { void api<{ publicKey: string | null }>("/api/staff/push/config").then(result => setPushKey(result.publicKey)).catch(() => undefined); }, []);
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
    if (pushKey && "serviceWorker" in navigator && "PushManager" in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodePushKey(pushKey) });
        await api("/api/staff/push/subscriptions", json("POST", subscription.toJSON()));
        localStorage.setItem(`dtu-background-push-${user?.id}`, "enabled");
        setPushError("");
      } catch (error) {
        setPushError(`Background alerts could not be enabled: ${(error as Error).message}`);
      }
    }
    setDeviceState("on");
    window.dispatchEvent(new Event("notifications-changed"));
    await showDeviceNotification("DTU notifications are on", {
      body: "Assignments, replies and deadline alerts can now appear on this device.",
      tag: "dtu-notifications-enabled",
      data: { url: "/notifications" }
    });
  };
  const disableDeviceNotifications = async () => {
    if ("serviceWorker" in navigator) {
      const subscription = await (await navigator.serviceWorker.ready).pushManager?.getSubscription();
      if (subscription) {
        await api("/api/staff/push/subscriptions", json("DELETE", { endpoint: subscription.endpoint })).catch(() => undefined);
        await subscription.unsubscribe();
      }
    }
    localStorage.removeItem(`dtu-background-push-${user?.id}`);
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
        <p>{deviceNotificationMessage(deviceState, isInstalled)}{deviceState === "on" && !pushKey ? " Background delivery requires VAPID keys on the server." : ""}</p>
        {pushError && <p className="notice notice-error">{pushError}</p>}
      </div>
      <div className="notification-preference-actions">
        {deviceState === "on"
          ? <><button className="button button-secondary" onClick={() => void disableDeviceNotifications()}>Turn off</button>{pushKey && localStorage.getItem(`dtu-background-push-${user?.id}`) !== "enabled" && <button className="button button-primary" onClick={() => void enableDeviceNotifications()}>Enable background alerts</button>}</>
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
  if (state === "on") return `Alerts are enabled${isInstalled ? " for the installed app" : " in this browser"}. Background delivery is available when phone push is configured.`;
  return "Turn on alerts for new assignments, comments, public replies, and approaching deadlines.";
}

function decodePushKey(key: string) {
  const padded = key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}
