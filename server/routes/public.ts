import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { z } from "zod";
import { config, paths } from "../config.js";
import { db, nextIdentifier } from "../db.js";
import { randomToken, storageAvailable, tokenHash, validUpload, verifyTurnstile } from "../security.js";
import { audit, cleanText, notifyRoles, sendMailSafely } from "../services.js";

export const publicRouter = Router();

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions. Please wait and try again." }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3 }
});

const urgency = z.enum(["low", "medium", "high", "critical"]);

async function storeFiles(files: Express.Multer.File[], workItemId: number) {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (!(await storageAvailable(total))) throw new Error("Storage capacity is currently too low for uploads");
  const stored: number[] = [];
  try {
    for (const file of files) {
      if (!validUpload(file)) throw new Error(`Unsupported or invalid file: ${file.originalname}`);
      const ext = file.mimetype === "image/jpeg" ? ".jpg"
        : file.mimetype === "image/png" ? ".png"
        : file.mimetype === "image/webp" ? ".webp" : ".pdf";
      const storedName = `${crypto.randomUUID()}${ext}`;
      await fs.promises.writeFile(path.join(paths.uploads, storedName), file.buffer, { flag: "wx" });
      const result = db.prepare(`
        INSERT INTO attachments(work_item_id, original_name, stored_name, mime_type, size, public_visible)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(workItemId, cleanText(file.originalname, 255), storedName, file.mimetype, file.size);
      stored.push(Number(result.lastInsertRowid));
    }
  } catch (error) {
    for (const id of stored) {
      const row = db.prepare("SELECT stored_name FROM attachments WHERE id = ?").get(id) as { stored_name: string } | undefined;
      if (row) await fs.promises.rm(path.join(paths.uploads, row.stored_name), { force: true });
      db.prepare("DELETE FROM attachments WHERE id = ?").run(id);
    }
    throw error;
  }
}

publicRouter.get("/config", (_req, res) => {
  res.json({ turnstileSiteKey: config.turnstileSiteKey });
});

publicRouter.get("/projects/:token", (req, res) => {
  const project = db.prepare(`
    SELECT id, project_no, name, department_name, status
    FROM projects WHERE qr_token = ? AND status NOT IN ('cancelled')
  `).get(req.params.token);
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json({ project });
});

publicRouter.post("/projects/:token/issues", publicLimiter, upload.array("attachments", 3), async (req, res, next) => {
  try {
    const project = db.prepare("SELECT id, name, project_no FROM projects WHERE qr_token = ? AND status != 'cancelled'").get(req.params.token) as { id: number; name: string; project_no: string } | undefined;
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!(await verifyTurnstile(req.body.turnstileToken, req.ip))) return res.status(400).json({ error: "Human verification failed" });
    const parsed = z.object({
      reporterName: z.string().trim().min(2).max(120),
      department: z.enum(["Production", "Quality", "Logistic", "Others"]),
      email: z.preprocess(value => String(value ?? "").trim(), z.union([z.literal(""), z.string().email().max(200)])),
      phone: z.string().max(50).optional().default(""),
      title: z.string().trim().min(3).max(200),
      description: z.string().trim().min(10).max(5000),
      urgency
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Please check all required fields", details: parsed.error.flatten() });

    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.some(file => !validUpload(file))) return res.status(400).json({ error: "One or more attachments are invalid" });
    if (!(await storageAvailable(files.reduce((sum, file) => sum + file.size, 0)))) return res.status(507).json({ error: "Storage capacity is currently too low for uploads" });
    const transaction = db.transaction(() => {
      const ticketNo = nextIdentifier("TKT");
      const result = db.prepare(`
        INSERT INTO work_items(ticket_no, project_id, type, title, description, priority, status,
          reporter_name, reporter_department, reporter_email, reporter_phone, source)
        VALUES (?, ?, 'issue', ?, ?, ?, 'new', ?, ?, ?, ?, 'qr')
      `).run(ticketNo, project.id, cleanText(parsed.data.title, 200), cleanText(parsed.data.description), parsed.data.urgency,
        cleanText(parsed.data.reporterName, 120), cleanText(parsed.data.department, 150), parsed.data.email || null, cleanText(parsed.data.phone, 50));
      const workItemId = Number(result.lastInsertRowid);
      const trackingToken = randomToken();
      db.prepare("INSERT INTO public_tracking_tokens(token_hash, work_item_id) VALUES (?, ?)").run(tokenHash(trackingToken), workItemId);
      return { workItemId, ticketNo, trackingToken };
    });
    const result = transaction();
    try {
      await storeFiles(files, result.workItemId);
    } catch (error) {
      db.prepare("DELETE FROM work_items WHERE id = ?").run(result.workItemId);
      throw error;
    }
    notifyRoles(["admin", "lead"], "new_issue", `New issue ${result.ticketNo}`, `${project.name}: ${parsed.data.title}`, `/tickets/${result.workItemId}`);
    audit({ name: parsed.data.reporterName }, "public_issue_created", "work_item", result.workItemId, { ticketNo: result.ticketNo, projectId: project.id }, req.ip);
    const trackingUrl = `${config.publicBaseUrl}/track/${result.trackingToken}`;
    void sendMailSafely(parsed.data.email, `DTU issue received: ${result.ticketNo}`,
      `We received your report for ${project.name}. Track it here: ${trackingUrl}`);
    res.status(201).json({ ticketNo: result.ticketNo, trackingUrl });
  } catch (error) {
    next(error);
  }
});

publicRouter.post("/requests", publicLimiter, async (req, res) => {
  if (!(await verifyTurnstile(req.body.turnstileToken, req.ip))) return res.status(400).json({ error: "Human verification failed" });
  const parsed = z.object({
    title: z.string().trim().min(3).max(200),
    department: z.string().trim().min(2).max(150),
    requesterName: z.string().trim().min(2).max(120),
    email: z.string().email().max(200),
    phone: z.string().max(50).optional().default(""),
    currentProblem: z.string().trim().min(10).max(5000),
    desiredOutcome: z.string().trim().min(10).max(5000),
    expectedUsers: z.coerce.number().int().positive().max(1_000_000).optional(),
    urgency,
    targetDate: z.string().max(20).optional().default("")
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please check all required fields", details: parsed.error.flatten() });

  const result = db.transaction(() => {
    const requestNo = nextIdentifier("REQ");
    const inserted = db.prepare(`
      INSERT INTO project_requests(request_no, title, department_name, requester_name, requester_email,
        requester_phone, current_problem, desired_outcome, expected_users, urgency, target_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(requestNo, cleanText(parsed.data.title, 200), cleanText(parsed.data.department, 150),
      cleanText(parsed.data.requesterName, 120), parsed.data.email, cleanText(parsed.data.phone, 50),
      cleanText(parsed.data.currentProblem), cleanText(parsed.data.desiredOutcome), parsed.data.expectedUsers ?? null,
      parsed.data.urgency, parsed.data.targetDate || null);
    const requestId = Number(inserted.lastInsertRowid);
    const trackingToken = randomToken();
    db.prepare("INSERT INTO public_tracking_tokens(token_hash, project_request_id) VALUES (?, ?)").run(tokenHash(trackingToken), requestId);
    return { requestId, requestNo, trackingToken };
  })();
  notifyRoles(["admin", "lead"], "new_request", `New project request ${result.requestNo}`, parsed.data.title, `/requests/${result.requestId}`);
  audit({ name: parsed.data.requesterName }, "project_request_created", "project_request", result.requestId, { requestNo: result.requestNo }, req.ip);
  const trackingUrl = `${config.publicBaseUrl}/track/${result.trackingToken}`;
  void sendMailSafely(parsed.data.email, `DTU request received: ${result.requestNo}`, `We received your request. Track it here: ${trackingUrl}`);
  res.status(201).json({ requestNo: result.requestNo, trackingUrl });
});

publicRouter.get("/track/:token", (req, res) => {
  const hash = tokenHash(String(req.params.token));
  const token = db.prepare("SELECT * FROM public_tracking_tokens WHERE token_hash = ?").get(hash) as { work_item_id: number | null; project_request_id: number | null } | undefined;
  if (!token) return res.status(404).json({ error: "Tracking link is invalid" });
  if (token.work_item_id) {
    const item = db.prepare(`
      SELECT w.id, w.ticket_no AS reference_no, w.title, w.status, w.priority, w.created_at, w.updated_at,
             p.name AS project_name
      FROM work_items w LEFT JOIN projects p ON p.id = w.project_id WHERE w.id = ?
    `).get(token.work_item_id);
    const comments = db.prepare(`
      SELECT id, author_name, body, created_at FROM comments
      WHERE work_item_id = ? AND public_visible = 1 ORDER BY created_at ASC
    `).all(token.work_item_id);
    const attachments = db.prepare(`
      SELECT id, original_name, mime_type, size, created_at FROM attachments
      WHERE work_item_id = ? AND public_visible = 1 ORDER BY created_at
    `).all(token.work_item_id);
    return res.json({ kind: "issue", item, comments, attachments });
  }
  const item = db.prepare(`
    SELECT id, request_no AS reference_no, title, status, urgency AS priority, created_at, updated_at
    FROM project_requests WHERE id = ?
  `).get(token.project_request_id);
  const comments = db.prepare(`
    SELECT id, author_name, body, created_at FROM comments
    WHERE project_request_id = ? AND public_visible = 1 ORDER BY created_at ASC
  `).all(token.project_request_id);
  res.json({ kind: "request", item, comments, attachments: [] });
});

publicRouter.post("/track/:token/replies", publicLimiter, (req, res) => {
  const hash = tokenHash(String(req.params.token));
  const token = db.prepare("SELECT * FROM public_tracking_tokens WHERE token_hash = ?").get(hash) as { work_item_id: number | null; project_request_id: number | null } | undefined;
  if (!token) return res.status(404).json({ error: "Tracking link is invalid" });
  const parsed = z.object({ authorName: z.string().trim().min(2).max(120), body: z.string().trim().min(2).max(5000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Name and reply are required" });
  db.prepare(`
    INSERT INTO comments(work_item_id, project_request_id, author_name, body, public_visible)
    VALUES (?, ?, ?, ?, 1)
  `).run(token.work_item_id, token.project_request_id, cleanText(parsed.data.authorName, 120), cleanText(parsed.data.body));
  const link = token.work_item_id ? `/tickets/${token.work_item_id}` : `/requests/${token.project_request_id}`;
  notifyRoles(["admin", "lead"], "public_reply", "Reporter replied", parsed.data.body.slice(0, 140), link);
  res.status(201).json({ ok: true });
});

publicRouter.get("/attachments/:id/:token", (req, res) => {
  const tracking = db.prepare("SELECT work_item_id, project_request_id FROM public_tracking_tokens WHERE token_hash = ?").get(tokenHash(String(req.params.token))) as { work_item_id: number | null; project_request_id: number | null } | undefined;
  if (!tracking) return res.status(404).end();
  const attachment = db.prepare(`
    SELECT * FROM attachments WHERE id = ? AND public_visible = 1
      AND (work_item_id = ? OR project_request_id = ?)
  `).get(req.params.id, tracking.work_item_id, tracking.project_request_id) as { stored_name: string; original_name: string } | undefined;
  if (!attachment) return res.status(404).end();
  res.download(path.join(paths.uploads, attachment.stored_name), attachment.original_name);
});
