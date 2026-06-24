import nodemailer from "nodemailer";
import { db } from "./db.js";
import { config } from "./config.js";

let mailTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getMailTransporter() {
  if (!config.smtp.host) throw new Error("SMTP is not configured");
  if (!mailTransporter) {
    mailTransporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000
    });
  }
  return mailTransporter;
}

function staffLink(link?: string) {
  if (!link) return "";
  return new URL(link, config.appBaseUrl).toString();
}

export function audit(actor: { id?: number; name: string }, action: string, entityType: string, entityId: number | null, detail: unknown, ip?: string) {
  db.prepare(`
    INSERT INTO audit_events(actor_user_id, actor_name, action, entity_type, entity_id, detail_json, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(actor.id ?? null, actor.name, action, entityType, entityId, JSON.stringify(detail ?? {}), ip ?? null);
}

export function notify(userId: number, type: string, title: string, body: string, link?: string) {
  db.prepare(`
    INSERT INTO notifications(user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)
  `).run(userId, type, title, body, link ?? null);
  const recipient = db.prepare("SELECT email FROM users WHERE id = ? AND active = 1").get(userId) as { email: string | null } | undefined;
  if (recipient?.email) {
    const url = staffLink(link);
    const text = url ? `${body}\n\nOpen in DTU Control Centre: ${url}` : body;
    void sendMailSafely(recipient.email, title, text);
  }
}

export function notifyRoles(roles: string[], type: string, title: string, body: string, link?: string) {
  const users = db.prepare(`SELECT id FROM users WHERE active = 1 AND role IN (${roles.map(() => "?").join(",")})`).all(...roles) as { id: number }[];
  for (const user of users) notify(user.id, type, title, body, link);
}

export async function sendMail(to: string | null | undefined, subject: string, text: string, html?: string) {
  if (!to || !config.smtp.host) return { sent: false, reason: "SMTP is not configured" };
  await getMailTransporter().sendMail({
    from: config.smtp.from,
    to,
    subject,
    text,
    html,
    disableFileAccess: true,
    disableUrlAccess: true
  });
  return { sent: true };
}

export async function sendMailSafely(to: string | null | undefined, subject: string, text: string, html?: string) {
  try {
    return await sendMail(to, subject, text, html);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SMTP error";
    console.error(`Email delivery failed for ${to ?? "missing recipient"}: ${message}`);
    return { sent: false, reason: message };
  }
}

export async function verifyMailTransport() {
  if (!config.smtp.host) return { configured: false, verified: false, reason: "SMTP is not configured" };
  await getMailTransporter().verify();
  return { configured: true, verified: true };
}

export function cleanText(value: unknown, max = 5000) {
  return String(value ?? "").replace(/\0/g, "").trim().slice(0, max);
}
