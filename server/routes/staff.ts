import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import QRCode from "qrcode";
import argon2 from "argon2";
import { z } from "zod";
import { config, paths } from "../config.js";
import { db, nextIdentifier } from "../db.js";
import { requireRole, storageAvailable, validUpload } from "../security.js";
import { audit, cleanText, notify, sendMail, sendMailSafely, verifyMailTransport } from "../services.js";
import type { AuthenticatedRequest } from "../types.js";
import { malaysiaDate } from "../time.js";

export const staffRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 3 } });
const progressUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 4 } });
const statuses = ["new", "triaged", "assigned", "in_progress", "waiting", "resolved", "closed"] as const;
const priorities = ["low", "medium", "high", "critical"] as const;
const projectStatuses = ["planned", "in_progress", "on_hold", "complete_monitoring", "completed", "cancelled"] as const;
const activeProjectStatuses = ["planned", "in_progress", "on_hold", "complete_monitoring"] as const;
const mutableProjectStatuses = ["planned", "in_progress", "on_hold", "complete_monitoring", "completed"] as const;
const completeLikeProjectStatuses = new Set<string>(["complete_monitoring", "completed"]);
const staffPassword = z.string().min(12).max(200).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/);
const maxProjectLinks = 4;

const projectLinkSchema = z.object({
  title: z.string().trim().max(80).optional().default(""),
  url: z.string().trim().max(1000).optional().default("")
});

type ProjectLinkInput = {
  title: string;
  url: string;
};

function normalizeProjectUrl(value: string) {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(candidate);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
    throw new Error("Use a valid http or https link");
  }
  const normalized = url.toString();
  if (normalized.length > 1000) throw new Error("System link URLs must be 1000 characters or fewer");
  return normalized;
}

function parseProjectLinks(value: unknown) {
  const parsed = z.array(projectLinkSchema).max(maxProjectLinks).safeParse(value ?? []);
  if (!parsed.success) return { ok: false as const, error: "Add up to 4 system links" };
  const links: ProjectLinkInput[] = [];
  try {
    for (const link of parsed.data) {
      const title = cleanText(link.title, 80);
      const rawUrl = cleanText(link.url, 1000);
      if (!title && !rawUrl) continue;
      if (!title || !rawUrl) return { ok: false as const, error: "Each system link needs both a title and URL" };
      links.push({ title, url: normalizeProjectUrl(rawUrl) });
    }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Check the system links" };
  }
  return { ok: true as const, links };
}

function projectLinks(projectId: number | string) {
  return db.prepare(`
    SELECT id, title, url, sort_order FROM project_links
    WHERE project_id = ? ORDER BY sort_order, id
  `).all(projectId);
}

function replaceProjectLinks(projectId: number, links: ProjectLinkInput[]) {
  db.prepare("DELETE FROM project_links WHERE project_id = ?").run(projectId);
  links.forEach((link, index) => {
    db.prepare(`
      INSERT INTO project_links(project_id, title, url, sort_order)
      VALUES (?, ?, ?, ?)
    `).run(projectId, link.title, link.url, index);
  });
}

staffRouter.get("/dashboard", (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const today = malaysiaDate();
  const stats = {
    activeProjects: (db.prepare("SELECT COUNT(*) AS n FROM projects WHERE status IN ('planned','in_progress','on_hold','complete_monitoring')").get() as { n: number }).n,
    openIssues: (db.prepare("SELECT COUNT(*) AS n FROM work_items WHERE type = 'issue' AND status NOT IN ('resolved','closed')").get() as { n: number }).n,
    overdue: (db.prepare("SELECT COUNT(*) AS n FROM work_items WHERE due_date < ? AND status NOT IN ('resolved','closed')").get(today) as { n: number }).n,
    untriaged: (db.prepare("SELECT COUNT(*) AS n FROM project_requests WHERE status IN ('submitted','triage')").get() as { n: number }).n
  };
  const myWork = db.prepare(`
    SELECT w.*, p.name AS project_name, u.name AS assignee_name
    FROM work_items w LEFT JOIN projects p ON p.id = w.project_id LEFT JOIN users u ON u.id = w.assignee_id
    WHERE w.assignee_id = ? AND w.status NOT IN ('resolved','closed')
    ORDER BY CASE w.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, w.due_date
    LIMIT 8
  `).all(user.id);
  const upcoming = db.prepare(`
    SELECT w.id, w.ticket_no, w.title, w.status, w.priority, w.due_date, p.name AS project_name, u.name AS assignee_name
    FROM work_items w LEFT JOIN projects p ON p.id = w.project_id LEFT JOIN users u ON u.id = w.assignee_id
    WHERE w.due_date IS NOT NULL AND w.status NOT IN ('resolved','closed')
    ORDER BY w.due_date LIMIT 8
  `).all();
  const workload = db.prepare(`
    SELECT u.id, u.name, COUNT(w.id) AS count
    FROM users u LEFT JOIN work_items w ON w.assignee_id = u.id AND w.status NOT IN ('resolved','closed')
    WHERE u.active = 1 GROUP BY u.id ORDER BY count DESC, u.name
  `).all();
  const activity = db.prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 10").all();
  res.json({ stats, myWork, upcoming, workload, activity });
});

staffRouter.get("/projects", (_req, res) => {
  res.json(db.prepare(`
    SELECT p.*, u.name AS owner_name,
      COUNT(w.id) AS work_count,
      SUM(CASE WHEN w.status NOT IN ('resolved','closed') THEN 1 ELSE 0 END) AS open_count
    FROM projects p LEFT JOIN users u ON u.id = p.owner_id LEFT JOIN work_items w ON w.project_id = p.id
    GROUP BY p.id ORDER BY p.updated_at DESC
  `).all());
});

staffRouter.post("/projects", requireRole("admin", "lead"), (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = z.object({
    name: z.string().trim().min(3).max(200),
    description: z.string().max(5000).default(""),
    departmentName: z.string().trim().min(2).max(150),
    ownerId: z.number().int().positive().nullable().optional(),
    status: z.enum(projectStatuses).default("planned"),
    priority: z.enum(priorities).default("medium"),
    startDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    links: z.array(projectLinkSchema).max(maxProjectLinks).optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid project data", details: parsed.error.flatten() });
  const parsedLinks = parseProjectLinks(parsed.data.links);
  if (!parsedLinks.ok) return res.status(400).json({ error: parsedLinks.error });
  const projectNo = nextIdentifier("PRJ");
  const id = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO projects(project_no, name, description, department_name, owner_id, status, priority, start_date, due_date, qr_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(projectNo, cleanText(parsed.data.name, 200), cleanText(parsed.data.description), cleanText(parsed.data.departmentName, 150),
      parsed.data.ownerId ?? null, parsed.data.status, parsed.data.priority, parsed.data.startDate || null, parsed.data.dueDate || null, crypto.randomBytes(18).toString("base64url"));
    const projectId = Number(result.lastInsertRowid);
    replaceProjectLinks(projectId, parsedLinks.links);
    return projectId;
  })();
  audit(authReq.user, "project_created", "project", id, { projectNo }, req.ip);
  res.status(201).json({ id, projectNo });
});

staffRouter.get("/projects/:id", (req, res) => {
  const project = db.prepare(`
    SELECT p.*, u.name AS owner_name, updater.name AS progress_updated_by_name
    FROM projects p
    LEFT JOIN users u ON u.id = p.owner_id
    LEFT JOIN users updater ON updater.id = p.progress_updated_by
    WHERE p.id = ?
  `).get(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const workItems = db.prepare(`
    SELECT w.*, u.name AS assignee_name FROM work_items w LEFT JOIN users u ON u.id = w.assignee_id
    WHERE w.project_id = ? ORDER BY w.updated_at DESC
  `).all(req.params.id);
  const updates = db.prepare(`
    SELECT pu.*, COUNT(pui.id) AS image_count
    FROM project_updates pu
    LEFT JOIN project_update_images pui ON pui.project_update_id = pu.id
    WHERE pu.project_id = ?
    GROUP BY pu.id
    ORDER BY pu.created_at DESC, pu.id DESC
  `).all(req.params.id) as any[];
  const images = db.prepare(`
    SELECT pui.id, pui.project_update_id, pui.original_name, pui.mime_type, pui.size, pui.created_at
    FROM project_update_images pui
    JOIN project_updates pu ON pu.id = pui.project_update_id
    WHERE pu.project_id = ?
    ORDER BY pui.created_at DESC, pui.id DESC
  `).all(req.params.id);
  res.json({
    project,
    links: projectLinks(String(req.params.id)),
    workItems,
    updates: updates.map(update => ({ ...update, images: images.filter((image: any) => image.project_update_id === update.id) }))
  });
});

staffRouter.patch("/projects/:id/progress", progressUpload.array("images", 4), async (req, res, next) => {
  const storedNames: string[] = [];
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const existing = db.prepare("SELECT id, owner_id, status, progress FROM projects WHERE id = ?").get(req.params.id) as {
      id: number;
      owner_id: number | null;
      status: string;
      progress: number;
    } | undefined;
    if (!existing) return res.status(404).json({ error: "Project not found" });
    if (authReq.user.role === "member" && existing.owner_id !== authReq.user.id) {
      return res.status(403).json({ error: "Members can update progress only for projects they own" });
    }
    const parsed = z.object({
      status: z.enum(mutableProjectStatuses).optional(),
      progress: z.coerce.number().int().min(0).max(100).optional(),
      currentUpdate: z.string().trim().min(3).max(1000)
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Add a progress update between 3 and 1000 characters" });
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.mimetype) || !validUpload(file))) {
      return res.status(400).json({ error: "Progress photos must be valid JPG, PNG, or WebP images" });
    }
    if (!(await storageAvailable(files.reduce((total, file) => total + file.size, 0)))) {
      return res.status(507).json({ error: "Storage capacity is too low for these progress photos" });
    }
    const status = parsed.data.status ?? existing.status;
    const progress = completeLikeProjectStatuses.has(status) ? 100 : (parsed.data.progress ?? existing.progress);
    const body = cleanText(parsed.data.currentUpdate, 1000);
    for (const file of files) {
      const ext = file.mimetype === "image/jpeg" ? ".jpg" : file.mimetype === "image/png" ? ".png" : ".webp";
      const storedName = `${crypto.randomUUID()}${ext}`;
      await fs.promises.writeFile(path.join(paths.uploads, storedName), file.buffer, { flag: "wx" });
      storedNames.push(storedName);
    }
    const updateId = db.transaction(() => {
      db.prepare(`
        UPDATE projects SET status = ?, progress = ?, current_update = ?,
          progress_updated_at = CURRENT_TIMESTAMP, progress_updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(status, progress, body, authReq.user.id, existing.id);
      const result = db.prepare(`
        INSERT INTO project_updates(project_id, author_user_id, author_name, body, status, progress)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(existing.id, authReq.user.id, authReq.user.name, body, status, progress);
      const id = Number(result.lastInsertRowid);
      files.forEach((file, index) => {
        db.prepare(`
          INSERT INTO project_update_images(project_update_id, original_name, stored_name, mime_type, size)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, cleanText(file.originalname, 255), storedNames[index], file.mimetype, file.size);
      });
      return id;
    })();
    audit(authReq.user, "project_progress_updated", "project", existing.id, {
      updateId,
      status,
      progress,
      currentUpdate: parsed.data.currentUpdate,
      images: files.length
    }, req.ip);
    res.json({ ok: true, id: updateId });
  } catch (error) {
    await Promise.all(storedNames.map(name => fs.promises.rm(path.join(paths.uploads, name), { force: true })));
    next(error);
  }
});

staffRouter.get("/projects/progress-images/:id", (req, res) => {
  const image = db.prepare("SELECT stored_name, original_name, mime_type FROM project_update_images WHERE id = ?").get(req.params.id) as {
    stored_name: string; original_name: string; mime_type: string;
  } | undefined;
  if (!image) return res.status(404).end();
  res.setHeader("Content-Type", image.mime_type);
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.sendFile(path.resolve(paths.uploads, image.stored_name));
});

staffRouter.get("/briefing", requireRole("admin", "lead"), async (_req, res) => {
  const projects = (db.prepare(`
    SELECT p.*, owner.name AS owner_name, updater.name AS progress_updated_by_name,
      (SELECT COUNT(*) FROM work_items w WHERE w.project_id = p.id AND w.status NOT IN ('resolved','closed')) AS open_work_count,
      (SELECT COUNT(*) FROM project_updates pu WHERE pu.project_id = p.id) AS update_count,
      (SELECT pui.id FROM project_update_images pui
        JOIN project_updates pu ON pu.id = pui.project_update_id
        WHERE pu.project_id = p.id ORDER BY pui.created_at DESC, pui.id DESC LIMIT 1) AS latest_image_id
    FROM projects p
    LEFT JOIN users owner ON owner.id = p.owner_id
    LEFT JOIN users updater ON updater.id = p.progress_updated_by
    WHERE p.status != 'cancelled'
    ORDER BY CASE p.status WHEN 'in_progress' THEN 0 WHEN 'complete_monitoring' THEN 1 WHEN 'on_hold' THEN 2 WHEN 'planned' THEN 3 ELSE 4 END,
      CASE p.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      p.updated_at DESC
  `).all() as any[]).map(project => ({ ...project, links: projectLinks(project.id) }));
  const storage = await fs.promises.statfs(paths.uploads);
  const imageStats = db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes FROM project_update_images").get() as { count: number; bytes: number };
  res.json({
    projects,
    stats: {
      total: projects.length,
      active: projects.filter((project: any) => activeProjectStatuses.includes(project.status)).length,
      inProgress: projects.filter((project: any) => project.status === "in_progress").length,
      monitoring: projects.filter((project: any) => project.status === "complete_monitoring").length,
      onHold: projects.filter((project: any) => project.status === "on_hold").length,
      completed: projects.filter((project: any) => project.status === "completed").length,
      imageCount: imageStats.count,
      imageBytes: imageStats.bytes,
      freeBytes: Number(storage.bavail) * Number(storage.bsize)
    }
  });
});

staffRouter.get("/briefing/projects/:id", requireRole("admin", "lead"), (req, res) => {
  const project = db.prepare(`
    SELECT p.*, owner.name AS owner_name, updater.name AS progress_updated_by_name
    FROM projects p
    LEFT JOIN users owner ON owner.id = p.owner_id
    LEFT JOIN users updater ON updater.id = p.progress_updated_by
    WHERE p.id = ?
  `).get(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const updates = db.prepare(`
    SELECT pu.*, COUNT(pui.id) AS image_count
    FROM project_updates pu
    LEFT JOIN project_update_images pui ON pui.project_update_id = pu.id
    WHERE pu.project_id = ?
    GROUP BY pu.id
    ORDER BY pu.created_at DESC, pu.id DESC
  `).all(req.params.id) as any[];
  const images = db.prepare(`
    SELECT pui.id, pui.project_update_id, pui.original_name, pui.mime_type, pui.size, pui.created_at
    FROM project_update_images pui
    JOIN project_updates pu ON pu.id = pui.project_update_id
    WHERE pu.project_id = ?
    ORDER BY pui.created_at DESC, pui.id DESC
  `).all(req.params.id);
  const workItems = db.prepare(`
    SELECT w.id, w.ticket_no, w.title, w.type, w.status, w.priority, w.due_date, u.name AS assignee_name
    FROM work_items w LEFT JOIN users u ON u.id = w.assignee_id
    WHERE w.project_id = ?
    ORDER BY CASE WHEN w.status IN ('resolved','closed') THEN 1 ELSE 0 END,
      CASE w.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      w.due_date
  `).all(req.params.id);
  res.json({
    project,
    updates: updates.map(update => ({ ...update, images: images.filter((image: any) => image.project_update_id === update.id) })),
    links: projectLinks(String(req.params.id)),
    workItems
  });
});

staffRouter.post("/briefing/projects/:id/updates", requireRole("admin", "lead"), progressUpload.array("images", 4), async (req, res, next) => {
  const storedNames: string[] = [];
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const project = db.prepare("SELECT id, status, progress FROM projects WHERE id = ?").get(req.params.id) as {
      id: number; status: typeof projectStatuses[number]; progress: number;
    } | undefined;
    if (!project) return res.status(404).json({ error: "Project not found" });
    const parsed = z.object({
      currentUpdate: z.string().trim().min(3).max(3000),
      status: z.enum(projectStatuses),
      progress: z.coerce.number().int().min(0).max(100)
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the progress update details" });
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.mimetype) || !validUpload(file))) {
      return res.status(400).json({ error: "Progress photos must be valid JPG, PNG, or WebP images" });
    }
    if (!(await storageAvailable(files.reduce((total, file) => total + file.size, 0)))) {
      return res.status(507).json({ error: "Storage capacity is too low for these progress photos" });
    }
    const status = parsed.data.status;
    const progress = completeLikeProjectStatuses.has(status) ? 100 : parsed.data.progress;
    const body = cleanText(parsed.data.currentUpdate, 3000);
    for (const file of files) {
      const ext = file.mimetype === "image/jpeg" ? ".jpg" : file.mimetype === "image/png" ? ".png" : ".webp";
      const storedName = `${crypto.randomUUID()}${ext}`;
      await fs.promises.writeFile(path.join(paths.uploads, storedName), file.buffer, { flag: "wx" });
      storedNames.push(storedName);
    }
    const updateId = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO project_updates(project_id, author_user_id, author_name, body, status, progress)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(project.id, authReq.user.id, authReq.user.name, body, status, progress);
      const id = Number(result.lastInsertRowid);
      files.forEach((file, index) => {
        db.prepare(`
          INSERT INTO project_update_images(project_update_id, original_name, stored_name, mime_type, size)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, cleanText(file.originalname, 255), storedNames[index], file.mimetype, file.size);
      });
      db.prepare(`
        UPDATE projects SET status = ?, progress = ?, current_update = ?,
          progress_updated_at = CURRENT_TIMESTAMP, progress_updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(status, progress, body, authReq.user.id, project.id);
      return id;
    })();
    audit(authReq.user, "briefing_update_created", "project", project.id, { updateId, status, progress, images: files.length }, req.ip);
    res.status(201).json({ id: updateId });
  } catch (error) {
    await Promise.all(storedNames.map(name => fs.promises.rm(path.join(paths.uploads, name), { force: true })));
    next(error);
  }
});

staffRouter.get("/briefing/images/:id", requireRole("admin", "lead"), (req, res) => {
  const image = db.prepare("SELECT stored_name, original_name, mime_type FROM project_update_images WHERE id = ?").get(req.params.id) as {
    stored_name: string; original_name: string; mime_type: string;
  } | undefined;
  if (!image) return res.status(404).end();
  res.setHeader("Content-Type", image.mime_type);
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.sendFile(path.resolve(paths.uploads, image.stored_name));
});

staffRouter.patch("/projects/:id", requireRole("admin", "lead"), (req, res) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const existing = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: "Project not found" });
  const parsed = z.object({
    name: z.string().trim().min(3).max(200).optional(),
    description: z.string().max(5000).optional(),
    departmentName: z.string().trim().min(2).max(150).optional(),
    ownerId: z.number().int().positive().nullable().optional(),
    status: z.enum(projectStatuses).optional(),
    priority: z.enum(priorities).optional(),
    startDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    progress: z.number().int().min(0).max(100).optional(),
    links: z.array(projectLinkSchema).max(maxProjectLinks).optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid project data" });
  const parsedLinks = parsed.data.links === undefined ? undefined : parseProjectLinks(parsed.data.links);
  if (parsedLinks && !parsedLinks.ok) return res.status(400).json({ error: parsedLinks.error });
  const d = parsed.data;
  const status = String(d.status ?? existing.status);
  const progress = completeLikeProjectStatuses.has(status) ? 100 : (d.progress ?? Number(existing.progress));
  db.transaction(() => {
    db.prepare(`
      UPDATE projects SET name = ?, description = ?, department_name = ?, owner_id = ?, status = ?,
        priority = ?, start_date = ?, due_date = ?, progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(d.name ?? existing.name, d.description ?? existing.description, d.departmentName ?? existing.department_name,
      d.ownerId === undefined ? existing.owner_id : d.ownerId, status, d.priority ?? existing.priority,
      d.startDate === undefined ? existing.start_date : d.startDate, d.dueDate === undefined ? existing.due_date : d.dueDate,
      progress, req.params.id);
    if (parsedLinks) replaceProjectLinks(Number(req.params.id), parsedLinks.links);
  })();
  audit(authReq.user, "project_updated", "project", Number(req.params.id), d, req.ip);
  res.json({ ok: true });
});

staffRouter.get("/projects/:id/qr", async (req, res) => {
  const project = db.prepare("SELECT project_no, name, qr_token FROM projects WHERE id = ?").get(req.params.id) as { project_no: string; name: string; qr_token: string } | undefined;
  if (!project) return res.status(404).json({ error: "Project not found" });
  const url = `${config.publicBaseUrl}/p/${project.qr_token}`;
  const dataUrl = await QRCode.toDataURL(url, { width: 600, margin: 2, errorCorrectionLevel: "H", color: { dark: "#081a2b", light: "#ffffff" } });
  res.json({ dataUrl, url, project });
});

staffRouter.get("/tickets", (req, res) => {
  const where: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of [["status", "w.status"], ["type", "w.type"], ["projectId", "w.project_id"], ["assigneeId", "w.assignee_id"]] as const) {
    if (req.query[key]) { where.push(`${column} = ?`); values.push(req.query[key]); }
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  res.json(db.prepare(`
    SELECT w.*, p.name AS project_name, u.name AS assignee_name
    FROM work_items w LEFT JOIN projects p ON p.id = w.project_id LEFT JOIN users u ON u.id = w.assignee_id
    ${clause} ORDER BY w.updated_at DESC
  `).all(...values));
});

staffRouter.post("/tickets", (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = z.object({
    projectId: z.number().int().positive().nullable().optional(),
    type: z.enum(["task", "issue"]),
    title: z.string().trim().min(3).max(200),
    description: z.string().max(5000).default(""),
    priority: z.enum(priorities).default("medium"),
    status: z.enum(statuses).default("new"),
    assigneeId: z.number().int().positive().nullable().optional(),
    dueDate: z.string().nullable().optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid work item", details: parsed.error.flatten() });
  const ticketNo = nextIdentifier("TKT");
  const result = db.prepare(`
    INSERT INTO work_items(ticket_no, project_id, type, title, description, priority, status, assignee_id, due_date, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ticketNo, parsed.data.projectId ?? null, parsed.data.type, cleanText(parsed.data.title, 200),
    cleanText(parsed.data.description), parsed.data.priority, parsed.data.status, parsed.data.assigneeId ?? null,
    parsed.data.dueDate || null, authReq.user.id);
  const id = Number(result.lastInsertRowid);
  if (parsed.data.assigneeId) notify(parsed.data.assigneeId, "assignment", `${ticketNo} assigned to you`, parsed.data.title, `/tickets/${id}`);
  audit(authReq.user, "work_item_created", "work_item", id, { ticketNo }, req.ip);
  res.status(201).json({ id, ticketNo });
});

staffRouter.get("/tickets/:id", (req, res) => {
  const item = db.prepare(`
    SELECT w.*, p.name AS project_name, u.name AS assignee_name
    FROM work_items w LEFT JOIN projects p ON p.id = w.project_id LEFT JOIN users u ON u.id = w.assignee_id
    WHERE w.id = ?
  `).get(req.params.id);
  if (!item) return res.status(404).json({ error: "Work item not found" });
  const comments = db.prepare(`
    SELECT c.*, u.name AS user_name FROM comments c LEFT JOIN users u ON u.id = c.author_user_id
    WHERE c.work_item_id = ? ORDER BY c.created_at
  `).all(req.params.id);
  const attachments = db.prepare("SELECT id, original_name, mime_type, size, public_visible, created_at FROM attachments WHERE work_item_id = ?").all(req.params.id);
  const auditEvents = db.prepare("SELECT * FROM audit_events WHERE entity_type = 'work_item' AND entity_id = ? ORDER BY created_at DESC").all(req.params.id);
  res.json({ item, comments, attachments, auditEvents });
});

staffRouter.patch("/tickets/:id", (req, res) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const existing = db.prepare("SELECT * FROM work_items WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: "Work item not found" });
  const parsed = z.object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().max(5000).optional(),
    priority: z.enum(priorities).optional(),
    status: z.enum(statuses).optional(),
    assigneeId: z.number().int().positive().nullable().optional(),
    dueDate: z.string().nullable().optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid work item update" });
  const d = parsed.data;
  db.prepare(`
    UPDATE work_items SET title = ?, description = ?, priority = ?, status = ?, assignee_id = ?, due_date = ?,
      resolved_at = CASE WHEN ? IN ('resolved','closed') THEN COALESCE(resolved_at, CURRENT_TIMESTAMP) ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(d.title ?? existing.title, d.description ?? existing.description, d.priority ?? existing.priority,
    d.status ?? existing.status, d.assigneeId === undefined ? existing.assignee_id : d.assigneeId,
    d.dueDate === undefined ? existing.due_date : d.dueDate, d.status ?? existing.status, req.params.id);
  if (d.assigneeId && d.assigneeId !== existing.assignee_id) notify(d.assigneeId, "assignment", `${existing.ticket_no} assigned to you`, String(d.title ?? existing.title), `/tickets/${req.params.id}`);
  if (existing.reporter_email && d.status && d.status !== existing.status) {
    void sendMailSafely(String(existing.reporter_email), `${existing.ticket_no} status updated`,
      `Your issue is now ${d.status.replaceAll("_", " ")}.`);
  }
  audit(authReq.user, "work_item_updated", "work_item", Number(req.params.id), d, req.ip);
  res.json({ ok: true });
});

staffRouter.post("/tickets/:id/comments", upload.array("attachments", 3), async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const parsed = z.object({
      body: z.string().trim().min(1).max(5000),
      publicVisible: z.preprocess(value => value === true || value === "true", z.boolean()).default(false)
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Comment is required" });
    const item = db.prepare("SELECT * FROM work_items WHERE id = ?").get(req.params.id) as { id: number; ticket_no: string; assignee_id: number | null; reporter_email: string | null } | undefined;
    if (!item) return res.status(404).json({ error: "Work item not found" });
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!(await storageAvailable(files.reduce((n, f) => n + f.size, 0)))) return res.status(507).json({ error: "Storage capacity is too low" });
    if (files.some(file => !validUpload(file))) return res.status(400).json({ error: "One or more attachments are invalid" });
    const result = db.prepare(`
      INSERT INTO comments(work_item_id, author_user_id, author_name, body, public_visible)
      VALUES (?, ?, ?, ?, ?)
    `).run(item.id, authReq.user.id, authReq.user.name, cleanText(parsed.data.body), parsed.data.publicVisible ? 1 : 0);
    const commentId = Number(result.lastInsertRowid);
    for (const file of files) {
      const ext = file.mimetype === "image/jpeg" ? ".jpg" : file.mimetype === "image/png" ? ".png" : file.mimetype === "image/webp" ? ".webp" : ".pdf";
      const storedName = `${crypto.randomUUID()}${ext}`;
      await fs.promises.writeFile(path.join(paths.uploads, storedName), file.buffer, { flag: "wx" });
      db.prepare(`
        INSERT INTO attachments(work_item_id, comment_id, original_name, stored_name, mime_type, size, public_visible)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(item.id, commentId, cleanText(file.originalname, 255), storedName, file.mimetype, file.size, parsed.data.publicVisible ? 1 : 0);
    }
    if (item.assignee_id && item.assignee_id !== authReq.user.id) notify(item.assignee_id, "comment", `New comment on ${item.ticket_no}`, parsed.data.body.slice(0, 140), `/tickets/${item.id}`);
    if (parsed.data.publicVisible && item.reporter_email) void sendMailSafely(item.reporter_email, `Update on ${item.ticket_no}`, parsed.data.body);
    audit(authReq.user, "comment_created", "work_item", item.id, { publicVisible: parsed.data.publicVisible }, req.ip);
    res.status(201).json({ id: commentId });
  } catch (error) { next(error); }
});

staffRouter.get("/attachments/:id", (req, res) => {
  const attachment = db.prepare("SELECT * FROM attachments WHERE id = ?").get(req.params.id) as { stored_name: string; original_name: string } | undefined;
  if (!attachment) return res.status(404).end();
  res.download(path.join(paths.uploads, attachment.stored_name), attachment.original_name);
});

staffRouter.get("/requests", (_req, res) => {
  res.json(db.prepare("SELECT * FROM project_requests ORDER BY updated_at DESC").all());
});

staffRouter.get("/requests/intake-qr", async (_req, res) => {
  const url = `${config.publicBaseUrl.replace(/\/$/, "")}/request`;
  const dataUrl = await QRCode.toDataURL(url, {
    width: 720,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#081a2b", light: "#ffffff" }
  });
  res.json({ dataUrl, url });
});

staffRouter.get("/requests/:id", (req, res) => {
  const item = db.prepare("SELECT * FROM project_requests WHERE id = ?").get(req.params.id);
  if (!item) return res.status(404).json({ error: "Request not found" });
  const comments = db.prepare("SELECT * FROM comments WHERE project_request_id = ? ORDER BY created_at").all(req.params.id);
  res.json({ item, comments });
});

staffRouter.patch("/requests/:id", requireRole("admin", "lead"), (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = z.object({
    status: z.enum(["submitted", "triage", "needs_information", "approved", "rejected"]),
    triageNotes: z.string().max(5000).optional().default(""),
    ownerId: z.number().int().positive().nullable().optional(),
    dueDate: z.string().nullable().optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request update" });
  const request = db.prepare("SELECT * FROM project_requests WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!request) return res.status(404).json({ error: "Request not found" });
  let projectId = request.created_project_id as number | null;
  const operation = db.transaction(() => {
    if (parsed.data.status === "approved" && !projectId) {
      const projectNo = nextIdentifier("PRJ");
      const project = db.prepare(`
        INSERT INTO projects(project_no, name, description, department_name, owner_id, status, priority, due_date, qr_token, source_request_id)
        VALUES (?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?)
      `).run(projectNo, request.title, request.desired_outcome, request.department_name, parsed.data.ownerId ?? null,
        request.urgency, parsed.data.dueDate || request.target_date || null, crypto.randomBytes(18).toString("base64url"), request.id);
      projectId = Number(project.lastInsertRowid);
    }
    db.prepare(`
      UPDATE project_requests SET status = ?, triage_notes = ?, created_project_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(parsed.data.status, cleanText(parsed.data.triageNotes), projectId, req.params.id);
  });
  operation();
  if (parsed.data.status !== request.status) {
    const notes = parsed.data.triageNotes ? `\n\nDTU note: ${cleanText(parsed.data.triageNotes)}` : "";
    void sendMailSafely(String(request.requester_email), `${request.request_no} status updated`,
      `Your project request is now ${parsed.data.status.replaceAll("_", " ")}.${notes}`);
  }
  audit(authReq.user, parsed.data.status === "approved" ? "project_request_approved" : "project_request_updated",
    "project_request", Number(req.params.id), { ...parsed.data, projectId }, req.ip);
  res.json({ ok: true, projectId });
});

staffRouter.post("/requests/:id/comments", (req, res) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const parsed = z.object({ body: z.string().trim().min(1).max(5000), publicVisible: z.boolean().default(false) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Comment is required" });
  const item = db.prepare("SELECT * FROM project_requests WHERE id = ?").get(req.params.id) as { requester_email: string; request_no: string } | undefined;
  if (!item) return res.status(404).json({ error: "Request not found" });
  const result = db.prepare(`
    INSERT INTO comments(project_request_id, author_user_id, author_name, body, public_visible) VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, authReq.user.id, authReq.user.name, cleanText(parsed.data.body), parsed.data.publicVisible ? 1 : 0);
  if (parsed.data.publicVisible) void sendMailSafely(item.requester_email, `Update on ${item.request_no}`, parsed.data.body);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

staffRouter.get("/users", (_req, res) => {
  res.json(db.prepare("SELECT id, username, name, email, role, language, active, created_at FROM users ORDER BY active DESC, name").all());
});

staffRouter.post("/users", requireRole("admin"), async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = z.object({
    username: z.string().trim().min(3).max(60).regex(/^[a-zA-Z0-9._-]+$/),
    name: z.string().trim().min(2).max(120),
    email: z.string().email().nullable().optional(),
    role: z.enum(["admin", "lead", "member"]),
    language: z.enum(["en", "ms"]).default("en"),
    password: staffPassword
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid user details", details: parsed.error.flatten() });
  const hash = await argon2.hash(parsed.data.password, { type: argon2.argon2id });
  try {
    const result = db.prepare(`
      INSERT INTO users(username, name, email, password_hash, role, language, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(parsed.data.username, parsed.data.name, parsed.data.email ?? null, hash, parsed.data.role, parsed.data.language);
    const id = Number(result.lastInsertRowid);
    audit(authReq.user, "user_created", "user", id, { username: parsed.data.username, role: parsed.data.role }, req.ip);
    res.status(201).json({ id });
  } catch {
    res.status(409).json({ error: "Username already exists" });
  }
});

staffRouter.patch("/users/:id", requireRole("admin"), (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: "Invalid user" });
  const existing = db.prepare("SELECT id, name, email, role, language, active FROM users WHERE id = ?").get(userId) as {
    id: number; name: string; email: string | null; role: "admin" | "lead" | "member"; language: "en" | "ms"; active: number;
  } | undefined;
  if (!existing) return res.status(404).json({ error: "User not found" });
  const parsed = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().email().nullable().optional(),
    role: z.enum(["admin", "lead", "member"]).optional(),
    language: z.enum(["en", "ms"]).optional(),
    active: z.boolean().optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid user details", details: parsed.error.flatten() });
  const nextRole = parsed.data.role ?? existing.role;
  const nextActive = parsed.data.active === undefined ? Boolean(existing.active) : parsed.data.active;
  if (userId === authReq.user.id && (nextRole !== existing.role || !nextActive)) {
    return res.status(400).json({ error: "You cannot change your own role or disable your own account" });
  }
  if (existing.role === "admin" && existing.active && (nextRole !== "admin" || !nextActive)) {
    const activeAdmins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1").get() as { count: number };
    if (activeAdmins.count <= 1) return res.status(400).json({ error: "At least one active administrator is required" });
  }
  db.prepare(`
    UPDATE users SET name = ?, email = ?, role = ?, language = ?, active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(parsed.data.name ?? existing.name, parsed.data.email === undefined ? existing.email : parsed.data.email,
    nextRole, parsed.data.language ?? existing.language, nextActive ? 1 : 0, userId);
  if (!nextActive) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  audit(authReq.user, "user_updated", "user", userId, {
    name: parsed.data.name, emailChanged: parsed.data.email !== undefined, role: parsed.data.role,
    language: parsed.data.language, active: parsed.data.active
  }, req.ip);
  res.json({ ok: true });
});

staffRouter.post("/users/:id/reset-password", requireRole("admin"), async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: "Invalid user" });
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!existing) return res.status(404).json({ error: "User not found" });
  const parsed = z.object({ password: staffPassword }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Use at least 12 characters with upper, lower, and numeric characters" });
  }
  const hash = await argon2.hash(parsed.data.password, { type: argon2.argon2id });
  db.transaction(() => {
    db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(hash, userId);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  })();
  audit(authReq.user, "user_password_reset", "user", userId, {}, req.ip);
  res.json({ ok: true });
});

staffRouter.get("/departments", (_req, res) => {
  res.json(db.prepare("SELECT * FROM departments WHERE active = 1 ORDER BY name").all());
});

staffRouter.post("/departments", requireRole("admin"), (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(150), code: z.string().trim().min(2).max(20) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid department" });
  try {
    const result = db.prepare("INSERT INTO departments(name, code) VALUES (?, ?)").run(parsed.data.name, parsed.data.code.toUpperCase());
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  } catch { res.status(409).json({ error: "Department or code already exists" }); }
});

staffRouter.get("/notifications", (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  res.json(db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(user.id));
});

staffRouter.get("/notifications/summary", (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const result = db.prepare("SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id = ? AND read_at IS NULL").get(user.id) as { unreadCount: number };
  res.json(result);
});

staffRouter.post("/notifications/:id/read", (req, res) => {
  const user = (req as unknown as AuthenticatedRequest).user;
  db.prepare("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").run(req.params.id, user.id);
  res.json({ ok: true });
});

staffRouter.post("/notifications/read-all", (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const result = db.prepare("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL").run(user.id);
  res.json({ ok: true, updated: result.changes });
});

staffRouter.get("/audit", requireRole("admin", "lead"), (_req, res) => {
  res.json(db.prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 250").all());
});

staffRouter.get("/system/storage", requireRole("admin"), async (_req, res) => {
  const stats = await fs.promises.statfs(paths.uploads);
  const localBackups = (await fs.promises.readdir(paths.backups, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith(".enc"))
    .map(entry => entry.name)
    .sort()
    .reverse();
  res.json({
    totalBytes: Number(stats.blocks) * Number(stats.bsize),
    freeBytes: Number(stats.bavail) * Number(stats.bsize),
    minimumFreeBytes: config.minFreeStorageMb * 1024 * 1024,
    smtpConfigured: Boolean(config.smtp.host),
    smtp: {
      host: config.smtp.host || null,
      port: config.smtp.port,
      secure: config.smtp.secure,
      from: config.smtp.from
    },
    backupConfigured: Boolean(process.env.BACKUP_ENCRYPTION_KEY),
    r2Configured: Boolean(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET),
    latestLocalBackup: localBackups[0] ?? null
  });
});

staffRouter.post("/system/email/test", requireRole("admin"), async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = z.object({ recipient: z.string().trim().email().max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid test email address" });
  if (!config.smtp.host) return res.status(503).json({ error: "SMTP is not configured on the server" });
  try {
    await verifyMailTransport();
    await sendMail(parsed.data.recipient, "DTU Control Centre email test",
      `Email delivery is working.\n\nSent from DTU Control Centre at ${new Date().toISOString()}.`);
    audit(authReq.user, "smtp_test_sent", "system", null, { recipient: parsed.data.recipient }, req.ip);
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMTP connection failed";
    res.status(502).json({ error: `SMTP test failed: ${message.slice(0, 240)}` });
  }
});
