import webpush from "web-push";
import { config } from "./config.js";
import { db } from "./db.js";

export const pushConfigured = Boolean(config.vapid.publicKey && config.vapid.privateKey && config.vapid.subject);
if (pushConfigured) webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);

type PushSubscription = { endpoint: string; p256dh: string; auth: string };

export function pushSubscriptionCount(userId: number): number {
  return (db.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id = ?").get(userId) as { count: number }).count;
}

export async function sendTestPush(userId: number) {
  const subscriptions = db.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?").all(userId) as PushSubscription[];
  const results = await Promise.all(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify({ title: "DTU phone notification test", body: "Push notifications are reaching this device.", url: "/notifications" }),
        { TTL: 3600 }
      );
      return { accepted: true, expired: false, statusCode: null as number | null };
    } catch (error) {
      const statusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode : null;
      const expired = statusCode === 404 || statusCode === 410;
      if (expired) db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").run(subscription.endpoint, userId);
      return { accepted: false, expired, statusCode };
    }
  }));
  return {
    attempted: subscriptions.length,
    accepted: results.filter(result => result.accepted).length,
    expired: results.filter(result => result.expired).length,
    failed: results.filter(result => !result.accepted).length,
    failureCodes: [...new Set(results.filter(result => !result.accepted && result.statusCode).map(result => result.statusCode as number))]
  };
}

export function sendPush(userId: number, title: string, body: string, link?: string) {
  if (!pushConfigured) return;
  const subscriptions = db.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?").all(userId) as PushSubscription[];
  for (const subscription of subscriptions) {
    try {
      void webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify({ title, body, url: link || "/notifications" }), { TTL: 3600 })
        .catch((error: { statusCode?: number }) => {
          if (error.statusCode === 404 || error.statusCode === 410) db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(subscription.endpoint);
          else console.error("Push delivery failed", error);
        });
    } catch (error) {
      console.error("Push delivery failed", error);
    }
  }
}
