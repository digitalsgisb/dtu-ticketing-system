import { Router } from "express";
import rateLimit from "express-rate-limit";
import argon2 from "argon2";
import { z } from "zod";
import { db } from "../db.js";
import { authenticate, createSession, destroySession, requireCsrf, verifyPassword } from "../security.js";
import type { AuthenticatedRequest } from "../types.js";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." }
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const parsed = z.object({
    username: z.string().min(1).max(100),
    password: z.string().min(1).max(200)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Username and password are required" });

  const key = `${req.ip}:${parsed.data.username.toLowerCase()}`;
  const attempt = db.prepare("SELECT count, blocked_until FROM login_attempts WHERE key = ?").get(key) as { count: number; blocked_until: string | null } | undefined;
  if (attempt?.blocked_until && new Date(attempt.blocked_until) > new Date()) {
    return res.status(429).json({ error: "Login temporarily blocked" });
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE AND active = 1").get(parsed.data.username) as {
    id: number; password_hash: string; username: string; name: string; email: string | null; role: string; language: string; must_change_password: number;
  } | undefined;
  if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) {
    const nextCount = (attempt?.count ?? 0) + 1;
    const blockedUntil = nextCount >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
    db.prepare(`
      INSERT INTO login_attempts(key, count, blocked_until, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET count = excluded.count, blocked_until = excluded.blocked_until, updated_at = CURRENT_TIMESTAMP
    `).run(key, nextCount, blockedUntil);
    return res.status(401).json({ error: "Invalid username or password" });
  }
  db.prepare("DELETE FROM login_attempts WHERE key = ?").run(key);
  const csrfToken = await createSession(req, res, user.id);
  res.json({
    user: { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role, language: user.language },
    csrfToken,
    mustChangePassword: Boolean(user.must_change_password)
  });
});

authRouter.get("/me", authenticate, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const row = db.prepare("SELECT must_change_password FROM users WHERE id = ?").get(authReq.user.id) as { must_change_password: number };
  res.json({ user: authReq.user, csrfToken: authReq.csrfToken, mustChangePassword: Boolean(row.must_change_password) });
});

authRouter.post("/logout", authenticate, requireCsrf, (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

authRouter.post("/password", authenticate, requireCsrf, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12).max(200).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Use at least 12 characters with upper, lower, and numeric characters" });
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(authReq.user.id) as { password_hash: string };
  if (!(await verifyPassword(parsed.data.currentPassword, row.password_hash))) return res.status(400).json({ error: "Current password is incorrect" });
  const hash = await argon2.hash(parsed.data.newPassword, { type: argon2.argon2id });
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(hash, authReq.user.id);
  res.json({ ok: true });
});
