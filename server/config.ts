import "dotenv/config";
import path from "node:path";

const root = path.resolve(process.env.APP_ROOT || process.cwd());

function integer(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3100";

export const config = {
  root,
  port: integer("PORT", 3100),
  isProduction: process.env.NODE_ENV === "production",
  dataDir: process.env.DATA_DIR || path.join(root, "data"),
  appBaseUrl,
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : appBaseUrl.startsWith("https://"),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:5173",
  publicHostname: process.env.PUBLIC_HOSTNAME || "",
  sessionDays: integer("SESSION_DAYS", 7),
  initialAdminUsername: process.env.INITIAL_ADMIN_USERNAME || "admin",
  initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD || "ChangeMe123!",
  turnstileSecret: process.env.TURNSTILE_SECRET || "",
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || "",
  minFreeStorageMb: integer("MIN_FREE_STORAGE_MB", 512),
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: integer("SMTP_PORT", 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "DTU Control Centre <noreply@localhost>"
  }
};

export const paths = {
  database: path.join(config.dataDir, "dtu.sqlite"),
  uploads: path.join(config.dataDir, "uploads"),
  backups: path.join(config.dataDir, "backups")
};
