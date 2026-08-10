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

function showcaseAccess(token: string) {
  return db.prepare(`
    SELECT token, enabled, title, intro FROM showcase_settings WHERE id = 1 AND token = ?
  `).get(token) as { token: string; enabled: number; title: string; intro: string } | undefined;
}

function portfolioList(value: string | null | undefined) {
  return String(value ?? "").split(/\r?\n|,/).map(item => cleanText(item, 120)).filter(Boolean).slice(0, 16);
}

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

publicRouter.get("/showcase/:token", (req, res) => {
  const settings = showcaseAccess(req.params.token);
  if (!settings) return res.status(404).json({ error: "This showcase link is not valid" });
  if (!settings.enabled) return res.status(410).json({ error: "This visitor showcase is currently closed" });

  const projects = db.prepare(`
    SELECT p.id, p.name, p.description, p.department_name,
      sp.title_override, sp.summary_override, sp.image_mode, sp.features_text,
      (SELECT COUNT(*) FROM showcase_project_gallery spg WHERE spg.project_id = p.id) AS gallery_count,
      CASE
        WHEN sp.image_mode = 'custom' AND sp.custom_image_stored_name IS NOT NULL THEN 1
        WHEN sp.image_mode = 'latest' AND EXISTS (
          SELECT 1 FROM project_update_images pui
          JOIN project_updates pu ON pu.id = pui.project_update_id
          WHERE pu.project_id = p.id
        ) THEN 1
        ELSE 0
      END AS has_image
    FROM showcase_projects sp
    JOIN projects p ON p.id = sp.project_id
    WHERE sp.visible = 1 AND p.status != 'cancelled'
    ORDER BY sp.sort_order, p.name
  `).all().map((project: any) => ({
    id: project.id,
    name: project.title_override || project.name,
    summary: project.summary_override || project.description,
    department: project.department_name,
    imageUrl: project.has_image ? `/api/public/showcase/${req.params.token}/projects/${project.id}/image` : null,
    galleryCount: Number(project.gallery_count) + (project.has_image ? 1 : 0),
    featureCount: portfolioList(project.features_text).length,
    highlights: portfolioList(project.features_text).slice(0, 3)
  }));
  res.setHeader("Cache-Control", "no-store");
  res.json({ title: settings.title, intro: settings.intro, projects });
});

publicRouter.get("/showcase/:token/projects/:projectId", (req, res) => {
  const settings = showcaseAccess(req.params.token);
  if (!settings) return res.status(404).json({ error: "This showcase link is not valid" });
  if (!settings.enabled) return res.status(410).json({ error: "This visitor showcase is currently closed" });
  const project = db.prepare(`
    SELECT p.id, p.name, p.description, p.department_name,
      sp.title_override, sp.summary_override, sp.detail_overview, sp.problem_statement,
      sp.solution_description, sp.features_text, sp.impact_statement, sp.contribution,
      sp.technologies_text, sp.image_mode,
      CASE
        WHEN sp.image_mode = 'custom' AND sp.custom_image_stored_name IS NOT NULL THEN 1
        WHEN sp.image_mode = 'latest' AND EXISTS (
          SELECT 1 FROM project_update_images pui JOIN project_updates pu ON pu.id = pui.project_update_id
          WHERE pu.project_id = p.id
        ) THEN 1 ELSE 0
      END AS has_image
    FROM showcase_projects sp JOIN projects p ON p.id = sp.project_id
    WHERE sp.project_id = ? AND sp.visible = 1 AND p.status != 'cancelled'
  `).get(req.params.projectId) as any;
  if (!project) return res.status(404).json({ error: "Portfolio project not found" });
  const gallery = db.prepare(`
    SELECT id, caption FROM showcase_project_gallery WHERE project_id = ? ORDER BY sort_order, id
  `).all(project.id).map((item: any) => ({
    id: item.id,
    caption: item.caption,
    imageUrl: `/api/public/showcase/${req.params.token}/projects/${project.id}/gallery/${item.id}`
  }));
  const navigation = db.prepare(`
    SELECT p.id, COALESCE(sp.title_override, p.name) AS name
    FROM showcase_projects sp JOIN projects p ON p.id = sp.project_id
    WHERE sp.visible = 1 AND p.status != 'cancelled' ORDER BY sp.sort_order, p.name
  `).all() as { id: number; name: string }[];
  const index = navigation.findIndex(item => item.id === project.id);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    portfolioTitle: settings.title,
    project: {
      id: project.id,
      name: project.title_override || project.name,
      summary: project.summary_override || project.description,
      department: project.department_name,
      overview: project.detail_overview || project.description,
      problem: project.problem_statement || "",
      solution: project.solution_description || project.summary_override || project.description,
      features: portfolioList(project.features_text),
      impact: project.impact_statement || "",
      contribution: project.contribution || "",
      technologies: portfolioList(project.technologies_text),
      coverImageUrl: project.has_image ? `/api/public/showcase/${req.params.token}/projects/${project.id}/image` : null
    },
    gallery,
    previous: index > 0 ? navigation[index - 1] : null,
    next: index >= 0 && index < navigation.length - 1 ? navigation[index + 1] : null
  });
});

publicRouter.get("/showcase/:token/projects/:projectId/gallery/:galleryId", (req, res) => {
  const settings = showcaseAccess(req.params.token);
  if (!settings?.enabled) return res.status(404).end();
  const item = db.prepare(`
    SELECT COALESCE(spg.custom_image_stored_name, pui.stored_name) AS stored_name,
      COALESCE(spg.custom_image_mime_type, pui.mime_type) AS mime_type
    FROM showcase_project_gallery spg
    JOIN showcase_projects sp ON sp.project_id = spg.project_id AND sp.visible = 1
    JOIN projects p ON p.id = sp.project_id AND p.status != 'cancelled'
    LEFT JOIN project_update_images pui ON pui.id = spg.source_image_id
    WHERE spg.id = ? AND spg.project_id = ?
  `).get(req.params.galleryId, req.params.projectId) as { stored_name: string | null; mime_type: string | null } | undefined;
  if (!item?.stored_name || !item.mime_type) return res.status(404).end();
  res.setHeader("Content-Type", item.mime_type);
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.sendFile(path.resolve(paths.uploads, item.stored_name));
});

publicRouter.get("/showcase/:token/projects/:projectId/image", (req, res) => {
  const settings = showcaseAccess(req.params.token);
  if (!settings?.enabled) return res.status(404).end();
  const item = db.prepare(`
    SELECT sp.image_mode, sp.custom_image_stored_name, sp.custom_image_mime_type
    FROM showcase_projects sp JOIN projects p ON p.id = sp.project_id
    WHERE sp.project_id = ? AND sp.visible = 1 AND p.status != 'cancelled'
  `).get(req.params.projectId) as {
    image_mode: "latest" | "custom" | "none";
    custom_image_stored_name: string | null;
    custom_image_mime_type: string | null;
  } | undefined;
  if (!item || item.image_mode === "none") return res.status(404).end();

  let image: { stored_name: string; mime_type: string } | undefined;
  if (item.image_mode === "custom" && item.custom_image_stored_name && item.custom_image_mime_type) {
    image = { stored_name: item.custom_image_stored_name, mime_type: item.custom_image_mime_type };
  } else if (item.image_mode === "latest") {
    image = db.prepare(`
      SELECT pui.stored_name, pui.mime_type FROM project_update_images pui
      JOIN project_updates pu ON pu.id = pui.project_update_id
      WHERE pu.project_id = ? ORDER BY pui.created_at DESC, pui.id DESC LIMIT 1
    `).get(req.params.projectId) as { stored_name: string; mime_type: string } | undefined;
  }
  if (!image) return res.status(404).end();
  res.setHeader("Content-Type", image.mime_type);
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.sendFile(path.resolve(paths.uploads, image.stored_name));
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
