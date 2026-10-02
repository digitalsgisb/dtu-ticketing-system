import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { Empty, Loading, PageHeader } from "../components/UI";
import { showDeviceNotification, usePwa } from "../pwa";
import { useLiveRefresh } from "../live";
import { useAuth } from "../auth";
import { disablePush, enablePush, getPushStatus, type PushState } from "../pushNotifications";

type DeviceNotificationState = "unsupported" | "blocked" | "off" | "on";

export function NotificationsPage() {
  const { canInstall, install, isInstalled } = usePwa();
  const { user } = useAuth();
  const [items, setItems] = useState<any[] | null>(null);
  const [deviceState, setDeviceState] = useState<DeviceNotificationState>(() => getDeviceNotificationState());
  const [pushKey, setPushKey] = useState<string | null>(null);
  const [pushState, setPushState] = useState<PushState | "checking" | "error">("checking");
  const [pushError, setPushError] = useState("");
  const [testingPush, setTestingPush] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const load = () => api<any[]>("/api/staff/notifications").then(setItems);
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    void getPushStatus(user.id).then(result => {
      if (!active) return;
      setPushKey(result.publicKey);
      setPushState(result.state);
      if (result.state === "enabled") setDeviceState("on");
    }).catch(error => {
      if (!active) return;
      setPushState("error");
      setPushError(`Could not check phone push: ${(error as Error).message}`);
    });
    return () => { active = false; };
  }, [user?.id]);
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
    if (pushKey && user && "serviceWorker" in navigator && "PushManager" in window) {
      try {
        await enablePush(user.id, pushKey);
        setPushState("enabled");
        setPushError("");
      } catch (error) {
        setPushState("error");
        setPushError(`Background alerts could not be enabled: ${(error as Error).message}`);
      }
    }
    setDeviceState("on");
    window.dispatchEvent(new Event("notifications-changed"));
    await showDeviceNotification("DTU notifications are on", {
      body: "Assignments, replies and deadline alerts can now appear on this device.",
      tag: "dtu-notifications-enabled",
      data: { url: "/notifications" }
    }).catch(() => undefined);
  };
  const disableDeviceNotifications = async () => {
    if (user) await disablePush(user.id).catch(error => setPushError(`Could not remove phone push: ${(error as Error).message}`));
    localStorage.removeItem("dtu-device-notifications");
    setPushState("disabled");
    setDeviceState("off");
  };
  const testPush = async () => {
    setTestingPush(true);
    setTestMessage("");
    setPushError("");
    try {
      const result = await api<{ accepted: number; failed: number }>("/api/staff/push/test", json("POST"));
      setTestMessage(`Push service accepted the test for ${result.accepted} device${result.accepted === 1 ? "" : "s"}.${result.failed ? ` ${result.failed} failed.` : ""} Check your phone to confirm it appeared.`);
    } catch (error) {
      setPushError((error as Error).message);
    } finally {
      setTestingPush(false);
    }
  };
  return <>
    <PageHeader eyebrow="Attention feed" title="Notifications" description="Assignments, deadlines, submissions, and replies that need your attention."
      actions={unreadCount > 0 && <button className="button button-secondary" onClick={() => void markAllRead()}>Mark all as read</button>} />
    <section className="notification-preferences" aria-labelledby="device-notification-heading">
      <div className="notification-preference-icon" aria-hidden="true">🔔</div>
      <div>
        <span className="eyebrow">This device</span>
        <h2 id="device-notification-heading">Device notifications</h2>
        <p>{pushState === "install-required" ? pushStatusMessage(pushState) : `${deviceNotificationMessage(deviceState, isInstalled)} ${pushStatusMessage(pushState)}`}</p>
        {pushError && <p className="notice notice-error">{pushError}</p>}
        {testMessage && <p className="notice notice-success">{testMessage}</p>}
      </div>
      <div className="notification-preference-actions">
        {deviceState === "on"
          ? <><button className="button button-secondary" onClick={() => void disableDeviceNotifications()}>Turn off</button>{pushKey && pushState !== "enabled" && <button className="button button-primary" onClick={() => void enableDeviceNotifications()}>{pushState === "refresh-required" ? "Re-enable background alerts" : "Enable background alerts"}</button>}{pushState === "enabled" && <button className="button button-secondary" onClick={() => void testPush()} disabled={testingPush}>{testingPush ? "Testing…" : "Send test to my phone"}</button>}</>
          : deviceState !== "unsupported" && deviceState !== "blocked" && pushState !== "install-required" && pushState !== "insecure" && <button className="button button-primary" onClick={() => void enableDeviceNotifications()}>Enable notifications</button>}
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

function pushStatusMessage(state: PushState | "checking" | "error") {
  switch (state) {
    case "enabled": return "Background push is linked to this account and device.";
    case "refresh-required": return "The notification security key changed. Re-enable background alerts here.";
    case "install-required": return "On iPhone, add the site to the Home Screen and open it from there to enable push.";
    case "insecure": return "Background push requires the HTTPS site.";
    case "unsupported": return "Background push is unavailable in this browser.";
    case "server-disabled": return "Background push requires VAPID keys on the server.";
    case "denied": return "Allow notifications for this site in your phone settings.";
    case "disabled": return "Background push is not yet linked to this device.";
    case "checking": return "Checking background push…";
    case "error": return "Background push could not be verified.";
  }
}
