import webpush from "web-push";
import { config } from "./config.js";
import { db } from "./db.js";

export const pushConfigured = Boolean(config.vapid.publicKey && config.vapid.privateKey && config.vapid.subject);
if (pushConfigured) webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);

export function sendPush(userId: number, title: string, body: string, link?: string) {
  if (!pushConfigured) return;
  const subscriptions = db.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?").all(userId) as Array<{ endpoint: string; p256dh: string; auth: string }>;
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
