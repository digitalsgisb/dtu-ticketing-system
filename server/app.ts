import path from "node:path";
import fs from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { config } from "./config.js";
import { authenticate, blockStaffOnPublicHost, requireCsrf } from "./security.js";
import { authRouter } from "./routes/auth.js";
import { publicRouter } from "./routes/public.js";
import { staffRouter } from "./routes/staff.js";
import { importRouter } from "./routes/imports.js";
import { db } from "./db.js";
import { malaysiaDate, malaysiaMonthStartUtc } from "./time.js";

export const app = express();
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "img-src": ["'self'", "data:", "blob:"],
      "connect-src": ["'self'", "https://challenges.cloudflare.com"],
      "frame-src": ["https://challenges.cloudflare.com"],
      "script-src": ["'self'", "https://challenges.cloudflare.com"]
    }
  }
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

app.use((req, res, next) => {
  if (!config.publicHostname || req.hostname.toLowerCase() !== config.publicHostname.toLowerCase()) return next();
  if (req.path === "/") return res.redirect("/request");
  const allowed = req.path === "/" || req.path === "/request"
    || req.path === "/sugihara-grand-logo.png"
    || req.path.startsWith("/p/") || req.path.startsWith("/track/")
    || req.path.startsWith("/api/public/") || req.path.startsWith("/assets/");
  if (!allowed) return res.status(404).send("Not found");
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use("/api/public", publicRouter);
app.use("/api/auth", blockStaffOnPublicHost, authRouter);
app.use("/api/staff", blockStaffOnPublicHost, authenticate, requireCsrf, staffRouter);
app.use("/api/staff/imports", blockStaffOnPublicHost, authenticate, requireCsrf, importRouter);

app.get("/api/wallboard", blockStaffOnPublicHost, (_req, res) => {
  const today = malaysiaDate();
  const stats = {
    activeProjects: (db.prepare("SELECT COUNT(*) AS n FROM projects WHERE status IN ('planned','in_progress','on_hold')").get() as { n: number }).n,
    openIssues: (db.prepare("SELECT COUNT(*) AS n FROM work_items WHERE type = 'issue' AND status NOT IN ('resolved','closed')").get() as { n: number }).n,
    overdue: (db.prepare("SELECT COUNT(*) AS n FROM work_items WHERE due_date < ? AND status NOT IN ('resolved','closed')").get(today) as { n: number }).n,
    completedMonth: (db.prepare("SELECT COUNT(*) AS n FROM work_items WHERE status IN ('resolved','closed') AND resolved_at >= datetime(?)").get(malaysiaMonthStartUtc()) as { n: number }).n
  };
  const projects = db.prepare(`
    SELECT p.id, p.project_no, p.name, p.status, p.priority, p.progress, p.due_date,
      p.current_update, p.progress_updated_at, u.name AS owner_name
    FROM projects p LEFT JOIN users u ON u.id = p.owner_id
    WHERE p.status IN ('planned','in_progress','on_hold','completed')
    ORDER BY CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END,
      CASE p.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      CASE WHEN p.status = 'completed' THEN p.updated_at END DESC, p.due_date
  `).all();
  const tickets = db.prepare(`
    SELECT w.id, w.ticket_no, w.title, w.status, w.priority, w.due_date, p.name AS project_name, u.name AS assignee_name
    FROM work_items w LEFT JOIN projects p ON p.id = w.project_id LEFT JOIN users u ON u.id = w.assignee_id
    WHERE w.status NOT IN ('resolved','closed')
    ORDER BY CASE WHEN w.due_date < ? THEN 0 ELSE 1 END,
      CASE w.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, w.due_date
  `).all(today);
  res.json({ stats, projects, tickets, generatedAt: new Date().toISOString() });
});

const dist = path.join(config.root, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: config.isProduction ? "1d" : 0 }));
  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  if ("code" in error && error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Each attachment must be 5 MB or smaller" });
  res.status(500).json({ error: config.isProduction ? "Unexpected server error" : error.message });
});
