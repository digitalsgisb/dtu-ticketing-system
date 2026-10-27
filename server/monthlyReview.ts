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
    SELECT p.id, p.project_no, p.name, p.description, p.department_name, p.reporting_category,
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
  res.json({ month, projects, currentProjects, plans, requests });
});

monthlyReviewRouter.patch("/category", (req, res) => {
  const parsed = z.object({ kind: z.enum(["project", "request"]), id: z.number().int().positive(),
    category: z.enum(["AI", "IoT", "Software", "Automation", "Infrastructure", "Other"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid category" });
  const { kind, id, category } = parsed.data;
  const result = db.prepare(`UPDATE ${kind === "project" ? "projects" : "project_requests"} SET reporting_category = ? WHERE id = ?`).run(category, id);
  if (!result.changes) return res.status(404).json({ error: "Item not found" });
  audit((req as AuthenticatedRequest).user, "reporting_category_changed", kind, id, { category }, req.ip);
  res.json({ ok: true });
});
