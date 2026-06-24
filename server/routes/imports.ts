import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { db, nextIdentifier } from "../db.js";
import { requireRole } from "../security.js";
import { audit, cleanText } from "../services.js";
import type { AuthenticatedRequest } from "../types.js";

export const importRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
importRouter.use(requireRole("admin"));

const projectRow = z.object({
  name: z.string().trim().min(3).max(200),
  department: z.string().trim().min(2).max(150),
  description: z.string().max(5000).default(""),
  status: z.enum(["planned", "in_progress", "on_hold", "completed", "cancelled"]).default("planned"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  due_date: z.string().optional().default("")
});
const ticketRow = z.object({
  title: z.string().trim().min(3).max(200),
  project_no: z.string().trim().optional().default(""),
  type: z.enum(["task", "issue"]).default("issue"),
  description: z.string().max(5000).default(""),
  status: z.enum(["new", "triaged", "assigned", "in_progress", "waiting", "resolved", "closed"]).default("new"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  due_date: z.string().optional().default("")
});

importRouter.get("/templates/:kind", (req, res) => {
  const kind = String(req.params.kind);
  if (kind === "projects") {
    res.type("text/csv").attachment("dtu-project-import.csv").send("name,department,description,status,priority,due_date\nExample Project,Engineering,Digitize the process,planned,medium,2026-12-31\n");
  } else if (kind === "tickets") {
    res.type("text/csv").attachment("dtu-ticket-import.csv").send("title,project_no,type,description,status,priority,due_date\nExample issue,PRJ-0001,issue,Describe the issue,new,high,2026-12-31\n");
  } else res.status(404).end();
});

importRouter.post("/preview/:kind", upload.single("file"), (req, res) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const kind = String(req.params.kind);
  if (!req.file) return res.status(400).json({ error: "CSV file is required" });
  if (!["projects", "tickets"].includes(kind)) return res.status(404).json({ error: "Unknown import type" });
  let rows: Record<string, string>[];
  try {
    rows = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch (error) {
    return res.status(400).json({ error: `CSV could not be parsed: ${(error as Error).message}` });
  }
  if (rows.length > 1000) return res.status(400).json({ error: "A maximum of 1,000 rows may be imported at once" });
  const schema = kind === "projects" ? projectRow : ticketRow;
  const validRows: unknown[] = [];
  const errors: { row: number; message: string }[] = [];
  rows.forEach((row, index) => {
    const parsed = schema.safeParse(row);
    if (parsed.success) validRows.push(parsed.data);
    else errors.push({ row: index + 2, message: parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ") });
  });
  if (kind === "tickets") {
    for (const [index, row] of validRows.entries()) {
      const ticket = row as z.infer<typeof ticketRow>;
      if (ticket.project_no && !db.prepare("SELECT id FROM projects WHERE project_no = ?").get(ticket.project_no)) {
        errors.push({ row: index + 2, message: `Unknown project_no: ${ticket.project_no}` });
      }
    }
  }
  const token = crypto.randomBytes(24).toString("base64url");
  if (!errors.length) {
    db.prepare(`
      INSERT INTO import_batches(token, kind, payload_json, created_by, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(token, kind, JSON.stringify(validRows), authReq.user.id, new Date(Date.now() + 30 * 60_000).toISOString());
  }
  res.json({ token: errors.length ? null : token, totalRows: rows.length, validRows: validRows.length, errors, preview: validRows.slice(0, 20) });
});

importRouter.post("/commit/:token", (req, res) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const batch = db.prepare(`
    SELECT * FROM import_batches WHERE token = ? AND committed_at IS NULL AND expires_at > CURRENT_TIMESTAMP AND created_by = ?
  `).get(String(req.params.token), authReq.user.id) as { id: number; kind: "projects" | "tickets"; payload_json: string } | undefined;
  if (!batch) return res.status(404).json({ error: "Import preview expired or was already used" });
  const rows = JSON.parse(batch.payload_json) as Record<string, string>[];
  const operation = db.transaction(() => {
    if (batch.kind === "projects") {
      for (const row of rows) {
        db.prepare(`
          INSERT INTO projects(project_no, name, description, department_name, status, priority, due_date, qr_token)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(nextIdentifier("PRJ"), cleanText(row.name, 200), cleanText(row.description), cleanText(row.department, 150),
          row.status, row.priority, row.due_date || null, crypto.randomBytes(18).toString("base64url"));
      }
    } else {
      for (const row of rows) {
        const project = row.project_no ? db.prepare("SELECT id FROM projects WHERE project_no = ?").get(row.project_no) as { id: number } : null;
        db.prepare(`
          INSERT INTO work_items(ticket_no, project_id, type, title, description, status, priority, due_date, source, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'import', ?)
        `).run(nextIdentifier("TKT"), project?.id ?? null, row.type, cleanText(row.title, 200), cleanText(row.description),
          row.status, row.priority, row.due_date || null, authReq.user.id);
      }
    }
    db.prepare("UPDATE import_batches SET committed_at = CURRENT_TIMESTAMP WHERE id = ?").run(batch.id);
  });
  operation();
  audit(authReq.user, "csv_import_committed", "import_batch", batch.id, { kind: batch.kind, rows: rows.length }, req.ip);
  res.json({ ok: true, imported: rows.length });
});
