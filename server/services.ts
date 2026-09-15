import nodemailer from "nodemailer";
import { db } from "./db.js";
import { config } from "./config.js";
import { publishLiveUpdate } from "./liveUpdates.js";

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
  publishLiveUpdate();
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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character] ?? character);
}

export type TrackingEmailInput = {
  requesterName: string;
  referenceNo: string;
  title: string;
  trackingUrl: string;
  kind: "request" | "issue";
};

export function trackingEmailContent(input: TrackingEmailInput) {
  const requestLabel = input.kind === "request" ? "project request" : "issue report";
  const subject = `DTU ${input.kind === "request" ? "project request" : "issue report"} received – ${input.referenceNo}`;
  const text = `Dear ${input.requesterName},

Thank you for submitting your ${requestLabel}, “${input.title}”. It has been received by the Digital Transformation Unit and is now in our review queue.

Reference: ${input.referenceNo}
Current status: Received

Track your submission and view future updates here:
${input.trackingUrl}

For your privacy, this is a secure personal link. Please do not share it publicly. You may keep this email for future reference.

Best regards,
Digital Transformation Unit
Sugihara Grand Industries Sdn Bhd`;
  const name = escapeHtml(input.requesterName);
  const reference = escapeHtml(input.referenceNo);
  const title = escapeHtml(input.title);
  const url = escapeHtml(input.trackingUrl);
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#f2f6f7;font-family:Arial,Helvetica,sans-serif;color:#18384b">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f6f7;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #dce7ea;border-radius:16px;overflow:hidden">
<tr><td style="padding:26px 30px;background:#0b2638;color:#ffffff"><div style="font-size:11px;letter-spacing:1.7px;color:#6fd0c8;font-weight:bold">SUGIHARA GRAND INDUSTRIES SDN BHD</div><div style="margin-top:7px;font-size:22px;font-weight:bold">Digital Transformation Unit</div></td></tr>
<tr><td style="padding:32px 30px"><p style="margin:0 0 18px">Dear ${name},</p><h1 style="margin:0 0 14px;font-size:25px;line-height:1.25;color:#0b2638">We have received your ${requestLabel}.</h1><p style="margin:0 0 24px;line-height:1.7;color:#526d7b">Thank you for your submission. It is now in the DTU review queue, and we will share future updates through your private tracking page.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 26px;background:#f3f8f8;border-left:4px solid #2ba49d;border-radius:8px"><tr><td style="padding:18px"><div style="font-size:11px;color:#718995;text-transform:uppercase;letter-spacing:1px">Reference</div><div style="margin:4px 0 13px;font-size:18px;font-weight:bold;color:#0b2638">${reference}</div><div style="font-size:11px;color:#718995;text-transform:uppercase;letter-spacing:1px">Submission</div><div style="margin-top:4px;font-size:14px;color:#25485c">${title}</div></td></tr></table>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="border-radius:9px;background:#168b86"><a href="${url}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold">Track my submission</a></td></tr></table>
<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#718995;word-break:break-all">If the button does not open, copy this address into your browser:<br><a href="${url}" style="color:#147f7b">${url}</a></p>
<p style="margin:24px 0;border-top:1px solid #e4ecee"></p><p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:#718995"><strong style="color:#526d7b">Keep this link private.</strong> Anyone with this link can view your submission status.</p>
<p style="margin:0;line-height:1.6;color:#526d7b">Best regards,<br><strong style="color:#0b2638">Digital Transformation Unit</strong><br>Sugihara Grand Industries Sdn Bhd</p></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export function sendTrackingEmail(to: string | null | undefined, input: TrackingEmailInput) {
  const content = trackingEmailContent(input);
  return sendMailSafely(to, content.subject, content.text, content.html);
}

export type SubmissionUpdateEmailInput = {
  requesterName: string;
  referenceNo: string;
  title: string;
  headline: string;
  message: string;
  status: string;
  trackingUrl?: string;
  projectNo?: string | null;
  progress?: number | null;
  nextAction?: string | null;
  note?: string | null;
};

function emailParagraphs(value: string) {
  return escapeHtml(value).split(/\r?\n/).filter(Boolean).map(paragraph =>
    `<p style="margin:0 0 14px;line-height:1.7;color:#526d7b">${paragraph}</p>`
  ).join("");
}

export function submissionUpdateEmailContent(input: SubmissionUpdateEmailInput) {
  const subject = `${input.headline} – ${input.referenceNo}`;
  const status = input.status.replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
  const details = [
    `Reference: ${input.referenceNo}`,
    input.projectNo ? `Project: ${input.projectNo}` : "",
    `Status: ${status}`,
    input.progress !== undefined && input.progress !== null ? `Progress: ${input.progress}%` : "",
    input.note ? `DTU note: ${input.note}` : "",
    input.nextAction ? `Next action: ${input.nextAction}` : ""
  ].filter(Boolean).join("\n");
  const tracking = input.trackingUrl
    ? `\n\nView the latest update securely:\n${input.trackingUrl}\n\nPlease keep this private tracking link secure.`
    : "";
  const text = `Dear ${input.requesterName},\n\n${input.headline}\n\n${input.message}\n\n${details}${tracking}\n\nBest regards,\nDigital Transformation Unit\nSugihara Grand Industries Sdn Bhd`;
  const safe = {
    name: escapeHtml(input.requesterName),
    reference: escapeHtml(input.referenceNo),
    title: escapeHtml(input.title),
    headline: escapeHtml(input.headline),
    status: escapeHtml(status),
    projectNo: input.projectNo ? escapeHtml(input.projectNo) : "",
    note: input.note ? escapeHtml(input.note) : "",
    nextAction: input.nextAction ? escapeHtml(input.nextAction) : "",
    url: input.trackingUrl ? escapeHtml(input.trackingUrl) : ""
  };
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#f2f6f7;font-family:Arial,Helvetica,sans-serif;color:#18384b">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f6f7;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #dce7ea;border-radius:16px;overflow:hidden">
<tr><td style="padding:26px 30px;background:#0b2638;color:#ffffff"><div style="font-size:11px;letter-spacing:1.7px;color:#6fd0c8;font-weight:bold">SUGIHARA GRAND INDUSTRIES SDN BHD</div><div style="margin-top:7px;font-size:22px;font-weight:bold">Digital Transformation Unit</div></td></tr>
<tr><td style="padding:32px 30px"><div style="display:inline-block;margin-bottom:18px;padding:7px 11px;border-radius:999px;background:#e8f7f5;color:#147f7b;font-size:11px;font-weight:bold;letter-spacing:.7px;text-transform:uppercase">${safe.status}</div><p style="margin:0 0 16px">Dear ${safe.name},</p><h1 style="margin:0 0 14px;font-size:25px;line-height:1.25;color:#0b2638">${safe.headline}</h1>${emailParagraphs(input.message)}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0 26px;background:#f3f8f8;border-left:4px solid #2ba49d;border-radius:8px"><tr><td style="padding:18px"><div style="font-size:11px;color:#718995;text-transform:uppercase;letter-spacing:1px">Reference</div><div style="margin:4px 0 13px;font-size:18px;font-weight:bold;color:#0b2638">${safe.reference}</div><div style="font-size:11px;color:#718995;text-transform:uppercase;letter-spacing:1px">Request</div><div style="margin:4px 0 ${safe.projectNo || input.progress !== undefined ? "13px" : "0"};font-size:14px;color:#25485c">${safe.title}</div>${safe.projectNo ? `<div style="font-size:11px;color:#718995;text-transform:uppercase;letter-spacing:1px">Project</div><div style="margin:4px 0 ${input.progress !== undefined ? "13px" : "0"};font-size:14px;font-weight:bold;color:#25485c">${safe.projectNo}</div>` : ""}${input.progress !== undefined && input.progress !== null ? `<div style="font-size:11px;color:#718995;text-transform:uppercase;letter-spacing:1px">Progress</div><div style="margin-top:4px;font-size:14px;font-weight:bold;color:#25485c">${input.progress}%</div>` : ""}</td></tr></table>
${safe.note ? `<div style="margin:0 0 18px;padding:16px;border:1px solid #dce7ea;border-radius:9px"><div style="margin-bottom:6px;font-size:11px;color:#718995;text-transform:uppercase;letter-spacing:1px">DTU note</div><div style="line-height:1.6;color:#25485c">${safe.note}</div></div>` : ""}
${safe.nextAction ? `<div style="margin:0 0 22px;padding:16px;border:1px solid #dce7ea;border-radius:9px"><div style="margin-bottom:6px;font-size:11px;color:#718995;text-transform:uppercase;letter-spacing:1px">What happens next</div><div style="line-height:1.6;color:#25485c">${safe.nextAction}</div></div>` : ""}
${safe.url ? `<table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="border-radius:9px;background:#168b86"><a href="${safe.url}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold">View latest update</a></td></tr></table><p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#718995;word-break:break-all">Private tracking link:<br><a href="${safe.url}" style="color:#147f7b">${safe.url}</a></p>` : ""}
<p style="margin:24px 0;border-top:1px solid #e4ecee"></p><p style="margin:0;line-height:1.6;color:#526d7b">Best regards,<br><strong style="color:#0b2638">Digital Transformation Unit</strong><br>Sugihara Grand Industries Sdn Bhd</p></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export function sendSubmissionUpdateEmail(to: string | null | undefined, input: SubmissionUpdateEmailInput) {
  const content = submissionUpdateEmailContent(input);
  return sendMailSafely(to, content.subject, content.text, content.html);
}

export async function verifyMailTransport() {
  if (!config.smtp.host) return { configured: false, verified: false, reason: "SMTP is not configured" };
  await getMailTransporter().verify();
  return { configured: true, verified: true };
}

export function cleanText(value: unknown, max = 5000) {
  return String(value ?? "").replace(/\0/g, "").trim().slice(0, max);
}
