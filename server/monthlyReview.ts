import { Router } from "express";
import { z } from "zod";
import { db } from "./db.js";
import { requireRole } from "./security.js";
import { malaysiaDate } from "./time.js";
import { audit } from "./services.js";
import type { AuthenticatedRequest } from "./types.js";

export const monthlyReviewRouter = Router();
monthlyReviewRouter.use(requireRole("admin", "lead"));
monthlyReviewRouter.get("/", (req, res) => {
  const month = req.query.month ?? malaysiaDate().slice(0, 7);
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < "2000-01" || month > "2099-12") {
    return res.status(400).json({ error: "Choose a valid reporting month (2000–2099)" });
  }
  const start = `${month}-01 00:00:00`;
  const end = `${new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 10)} 00:00:00`;
  // SQLite timestamps are UTC; the reporting boundaries are Malaysian midnight.
  const bounds = { start, end };
  const projects = db.prepare(`
    SELECT p.id, p.project_no, p.name, p.description, p.department_name, p.reporting_category, p.group_id,
      p.due_date, owner.name AS owner_name, p.created_at,
      u.status, u.progress, u.body AS current_update, u.next_action, u.created_at AS snapshot_at,
      b.progress AS baseline_progress,
      (SELECT COUNT(*) FROM project_updates m WHERE m.project_id = p.id
        AND m.created_at >= datetime(@start, '-8 hours') AND m.created_at < datetime(@end, '-8 hours')) AS month_updates,
      (SELECT i.id FROM project_update_images i JOIN project_updates h ON h.id = i.project_update_id
        WHERE h.project_id = p.id AND h.created_at < datetime(@end, '-8 hours')
        ORDER BY h.created_at DESC, h.id DESC, i.id DESC LIMIT 1) AS image_id,
      CASE WHEN p.created_at >= datetime(@start, '-8 hours') THEN 1 ELSE 0 END AS is_new
    FROM projects p LEFT JOIN users owner ON owner.id = p.owner_id
    LEFT JOIN project_updates u ON u.id = (SELECT id FROM project_updates WHERE project_id = p.id
      AND created_at < datetime(@end, '-8 hours') ORDER BY created_at DESC, id DESC LIMIT 1)
    LEFT JOIN project_updates b ON b.id = (SELECT id FROM project_updates WHERE project_id = p.id
      AND created_at < datetime(@start, '-8 hours') ORDER BY created_at DESC, id DESC LIMIT 1)
    WHERE p.created_at < datetime(@end, '-8 hours')
    ORDER BY month_updates DESC, p.name
  `).all(bounds);
  const plans = db.prepare(`SELECT p.*, owner.name AS owner_name FROM projects p
    LEFT JOIN users owner ON owner.id = p.owner_id WHERE p.status = 'planned' ORDER BY p.start_date, p.name`).all();
  const currentProjects = db.prepare(`SELECT p.*, owner.name AS owner_name FROM projects p
    LEFT JOIN users owner ON owner.id = p.owner_id
    WHERE p.status IN ('in_progress', 'on_hold', 'complete_monitoring')
    ORDER BY CASE p.status WHEN 'on_hold' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, p.name`).all();
  const requests = db.prepare(`SELECT * FROM project_requests WHERE status IN ('submitted','triage','needs_information')
    ORDER BY created_at DESC`).all();
  const requestPortfolio = db.prepare(`SELECT r.*, p.project_no, p.status AS project_status, p.progress AS project_progress
    FROM project_requests r LEFT JOIN projects p ON p.id = r.created_project_id
    ORDER BY r.created_at DESC, r.id DESC`).all();
  const photos = db.prepare(`SELECT id, project_id, created_at, body FROM (
    SELECT i.id, u.project_id, i.created_at, u.body,
      ROW_NUMBER() OVER (PARTITION BY u.project_id ORDER BY i.created_at DESC, i.id DESC) AS position
    FROM project_update_images i JOIN project_updates u ON u.id = i.project_update_id
  ) WHERE position <= 4 ORDER BY created_at DESC, id DESC`).all() as { id: number; project_id: number }[];
  const links = db.prepare("SELECT id, project_id, title, url FROM project_links ORDER BY sort_order, id").all() as { project_id: number }[];
  const portfolio = (db.prepare(`SELECT p.*, owner.name AS owner_name FROM projects p
    LEFT JOIN users owner ON owner.id = p.owner_id ORDER BY p.name COLLATE NOCASE, p.id`).all() as { id: number; group_id: number | null }[])
    .map(project => ({ ...project, links: links.filter(link => link.project_id === project.id), photos: photos.filter(photo => photo.project_id === project.id) }));
  const groups = (db.prepare("SELECT id, name, summary FROM project_groups ORDER BY name COLLATE NOCASE, id").all() as { id: number }[])
    .map(group => ({ ...group, project_ids: portfolio.filter(project => project.group_id === group.id).map(project => project.id) }));
  res.json({ month, projects, currentProjects, plans, requests, requestPortfolio, portfolio, groups });
});

const groupSchema = z.object({ name: z.string().trim().min(1).max(120), summary: z.string().trim().max(3000).default(""),
  projectIds: z.array(z.number().int().positive()).min(1).max(1000).refine(ids => new Set(ids).size === ids.length, "Choose each project once") });

monthlyReviewRouter.post("/groups", (req, res) => saveGroup(req as unknown as AuthenticatedRequest, res));
monthlyReviewRouter.patch("/groups/:id", (req, res) => saveGroup(req as unknown as AuthenticatedRequest, res, Number(req.params.id)));

function saveGroup(req: AuthenticatedRequest, res: import("express").Response, id?: number) {
  if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0 || !db.prepare("SELECT id FROM project_groups WHERE id = ?").get(id))) {
    return res.status(404).json({ error: "Project group not found" });
  }
  const parsed = groupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a group name and choose at least one project" });
  const { name, summary, projectIds } = parsed.data;
  if (db.prepare("SELECT id FROM project_groups WHERE name = ? COLLATE NOCASE AND id != ?").get(name, id ?? 0)) {
    return res.status(409).json({ error: "A project group with this name already exists" });
  }
  const placeholders = projectIds.map(() => "?").join(",");
  const projects = db.prepare(`SELECT id, group_id FROM projects WHERE id IN (${placeholders})`).all(...projectIds) as { id: number; group_id: number | null }[];
  if (projects.length !== projectIds.length) return res.status(400).json({ error: "One or more selected projects no longer exist" });
  if (projects.some(project => project.group_id !== null && project.group_id !== id)) {
    return res.status(409).json({ error: "A selected project already belongs to another group. Remove it from that group first." });
  }
  const groupId = db.transaction(() => {
    const resultId = id ?? Number(db.prepare("INSERT INTO project_groups(name, summary) VALUES (?, ?)").run(name, summary).lastInsertRowid);
    if (id !== undefined) {
      db.prepare("UPDATE project_groups SET name = ?, summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(name, summary, id);
      db.prepare("UPDATE projects SET group_id = NULL WHERE group_id = ?").run(id);
    }
    db.prepare(`UPDATE projects SET group_id = ? WHERE id IN (${placeholders})`).run(resultId, ...projectIds);
    return resultId;
  })();
  audit(req.user, id === undefined ? "project_group_created" : "project_group_updated", "project_group", groupId, { name, projectIds }, req.ip);
  res.status(id === undefined ? 201 : 200).json({ id: groupId });
}

monthlyReviewRouter.delete("/groups/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(404).json({ error: "Project group not found" });
  const group = db.prepare("SELECT name FROM project_groups WHERE id = ?").get(id) as { name: string } | undefined;
  if (!group) return res.status(404).json({ error: "Project group not found" });
  // ON DELETE SET NULL returns every child to the individual portfolio.
  db.prepare("DELETE FROM project_groups WHERE id = ?").run(id);
  audit((req as unknown as AuthenticatedRequest).user, "project_group_removed", "project_group", id, group, req.ip);
  res.json({ ok: true });
});

monthlyReviewRouter.patch("/category", (req, res) => {
  const parsed = z.object({ kind: z.enum(["project", "request"]), id: z.number().int().positive(),
    category: z.enum(["AI", "IoT", "Software", "Automation", "Infrastructure", "Other"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid category" });
  const { kind, id, category } = parsed.data;
  const result = db.prepare(`UPDATE ${kind === "project" ? "projects" : "project_requests"} SET reporting_category = ? WHERE id = ?`).run(category, id);
  if (!result.changes) return res.status(404).json({ error: "Item not found" });
  audit((req as unknown as AuthenticatedRequest).user, "reporting_category_changed", kind, id, { category }, req.ip);
  res.json({ ok: true });
});
