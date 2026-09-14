import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import argon2 from "argon2";
import { db } from "./db.js";
import { config, paths } from "./config.js";
import type { AuthenticatedRequest, Role, SessionUser } from "./types.js";

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const tokenHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export async function createSession(req: Request, res: Response, userId: number) {
  const token = randomToken();
  const csrf = randomToken(24);
  const expires = new Date(Date.now() + config.sessionDays * 86_400_000);
  db.prepare(`
    INSERT INTO sessions(user_id, token_hash, csrf_token, expires_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, tokenHash(token), csrf, expires.toISOString(), req.ip, req.get("user-agent")?.slice(0, 500));
  res.cookie("dtu_session", token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    maxAge: config.sessionDays * 86_400_000,
    path: "/"
  });
  return csrf;
}

export function destroySession(req: Request, res: Response) {
  const token = req.cookies?.dtu_session;
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
  res.clearCookie("dtu_session", { path: "/" });
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.dtu_session;
  if (!token) return res.status(401).json({ error: "Authentication required" });
  const row = db.prepare(`
    SELECT s.id AS session_id, s.csrf_token, s.expires_at,
           u.id, u.username, u.name, u.email, u.role, u.language, u.active
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(tokenHash(token)) as (SessionUser & { session_id: number; csrf_token: string; expires_at: string; active: number }) | undefined;
  if (!row || !row.active || new Date(row.expires_at) <= new Date()) {
    destroySession(req, res);
    return res.status(401).json({ error: "Session expired" });
  }
  db.prepare("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.session_id);
  const authReq = req as AuthenticatedRequest;
  authReq.user = {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    role: row.role,
    language: row.language
  };
  authReq.sessionId = row.session_id;
  authReq.csrfToken = row.csrf_token;
  next();
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const authReq = req as AuthenticatedRequest;
  if (!authReq.csrfToken || req.get("x-csrf-token") !== authReq.csrfToken) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).user;
    if (!user || !roles.includes(user.role)) return res.status(403).json({ error: "Insufficient permission" });
    next();
  };
}

export function blockStaffOnPublicHost(req: Request, res: Response, next: NextFunction) {
  if (config.publicHostname && req.hostname.toLowerCase() === config.publicHostname.toLowerCase()) {
    return res.status(404).json({ error: "Not found" });
  }
  next();
}

export function verifyPassword(password: string, hash: string) {
  return argon2.verify(hash, password);
}

export async function storageAvailable(extraBytes = 0) {
  try {
    const stats = await fs.promises.statfs(paths.uploads);
    const free = Number(stats.bavail) * Number(stats.bsize);
    return free - extraBytes >= config.minFreeStorageMb * 1024 * 1024;
  } catch {
    return true;
  }
}

const signatures: Record<string, (b: Buffer) => boolean> = {
  "image/jpeg": b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": b => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP",
  "application/pdf": b => b.subarray(0, 5).toString() === "%PDF-"
};

export function validUpload(file: Express.Multer.File) {
  return Boolean(signatures[file.mimetype]?.(file.buffer));
}

const proposalTypes: Record<string, { extensions: string[]; valid: (buffer: Buffer) => boolean }> = {
  "image/gif": { extensions: [".gif"], valid: buffer => ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString()) },
  "application/msword": { extensions: [".doc"], valid: compoundOfficeFile },
  "application/vnd.ms-excel": { extensions: [".xls"], valid: compoundOfficeFile },
  "application/vnd.ms-powerpoint": { extensions: [".ppt"], valid: compoundOfficeFile },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { extensions: [".docx"], valid: buffer => openXmlFile(buffer, "word/") },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { extensions: [".xlsx"], valid: buffer => openXmlFile(buffer, "xl/") },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { extensions: [".pptx"], valid: buffer => openXmlFile(buffer, "ppt/") },
  "text/plain": { extensions: [".txt"], valid: textFile },
  "text/csv": { extensions: [".csv"], valid: textFile },
  "application/csv": { extensions: [".csv"], valid: textFile }
};

function compoundOfficeFile(buffer: Buffer) {
  return buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
}

function openXmlFile(buffer: Buffer, folder: string) {
  return buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && buffer.includes(Buffer.from(folder));
}

function textFile(buffer: Buffer) {
  return !buffer.includes(0) && !buffer.toString("utf8").includes("\ufffd");
}

export function validProposalUpload(file: Express.Multer.File) {
  if (validUpload(file)) return true;
  const type = proposalTypes[file.mimetype];
  const extension = path.extname(file.originalname).toLowerCase();
  return Boolean(type?.extensions.includes(extension) && type.valid(file.buffer));
}

export function uploadExtension(file: Express.Multer.File) {
  const known: Record<string, string> = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
    "application/pdf": ".pdf", "application/msword": ".doc", "application/vnd.ms-excel": ".xls",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "text/plain": ".txt", "text/csv": ".csv", "application/csv": ".csv"
  };
  return known[file.mimetype] ?? "";
}

export async function verifyTurnstile(token: string | undefined, ip?: string) {
  if (!config.turnstileSecret) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret: config.turnstileSecret, response: token });
  if (ip) body.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body
  });
  const result = await response.json() as { success: boolean };
  return result.success;
}
