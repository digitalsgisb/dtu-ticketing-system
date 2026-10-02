import { api, json } from "./api";

export type PushState = "insecure" | "unsupported" | "install-required" | "server-disabled" | "denied" | "refresh-required" | "disabled" | "enabled";

const storageKey = (userId: number) => `dtu-background-push-${userId}`;

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function decodePushKey(key: string) {
  const padded = key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

function matchesPublicKey(subscription: PushSubscription, publicKey: string) {
  const currentKey = subscription.options.applicationServerKey;
  if (!currentKey) return false;
  const current = new Uint8Array(currentKey);
  const expected = decodePushKey(publicKey);
  return current.length === expected.length && current.every((byte, index) => byte === expected[index]);
}

export async function getPushStatus(userId: number): Promise<{ state: PushState; publicKey: string | null }> {
  const clear = () => localStorage.removeItem(storageKey(userId));
  if (!window.isSecureContext) { clear(); return { state: "insecure", publicKey: null }; }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    clear(); return { state: "unsupported", publicKey: null };
  }
  if (isIos() && !isInstalled()) { clear(); return { state: "install-required", publicKey: null }; }
  const { publicKey } = await api<{ publicKey: string | null }>("/api/staff/push/config");
  if (!publicKey) { clear(); return { state: "server-disabled", publicKey: null }; }
  if (Notification.permission === "denied") { clear(); return { state: "denied", publicKey }; }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) { clear(); return { state: "disabled", publicKey }; }
  if (!matchesPublicKey(subscription, publicKey)) {
    clear(); return { state: "refresh-required", publicKey };
  }
  await api("/api/staff/push/subscriptions", json("POST", subscription.toJSON()));
  localStorage.setItem(storageKey(userId), "enabled");
  localStorage.setItem("dtu-device-notifications", "enabled");
  return { state: "enabled", publicKey };
}

export async function enablePush(userId: number, publicKey: string) {
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !matchesPublicKey(subscription, publicKey)) {
    await api("/api/staff/push/subscriptions", json("DELETE", { endpoint: subscription.endpoint })).catch(() => undefined);
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodePushKey(publicKey) });
  await api("/api/staff/push/subscriptions", json("POST", subscription.toJSON()));
  localStorage.setItem(storageKey(userId), "enabled");
}

export async function disablePush(userId: number) {
  localStorage.removeItem(storageKey(userId));
  if (!("serviceWorker" in navigator)) return;
  const subscription = await (await navigator.serviceWorker.ready).pushManager?.getSubscription();
  if (!subscription) return;
  await api("/api/staff/push/subscriptions", json("DELETE", { endpoint: subscription.endpoint })).catch(() => undefined);
  await subscription.unsubscribe();
}
