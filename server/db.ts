import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import argon2 from "argon2";
import { config, paths } from "./config.js";
import { malaysiaYear } from "./time.js";

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(paths.uploads, { recursive: true });
fs.mkdirSync(paths.backups, { recursive: true });

export const db = new Database(paths.database);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
CREATE TABLE IF NOT EXISTS counters (
  name TEXT NOT NULL,
  year INTEGER NOT NULL DEFAULT 0,
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (name, year)
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','lead','member')),
  language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en','ms')),
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  blocked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_no TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  department_name TEXT NOT NULL,
  requester_name TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  requester_phone TEXT,
  current_problem TEXT NOT NULL,
  desired_outcome TEXT NOT NULL,
  expected_users INTEGER,
  urgency TEXT NOT NULL CHECK(urgency IN ('low','medium','high','critical')),
  target_date TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','triage','needs_information','approved','rejected')),
  triage_notes TEXT,
  created_project_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  department_id INTEGER REFERENCES departments(id),
  department_name TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','on_hold','complete_monitoring','completed','cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
  start_date TEXT,
  due_date TEXT,
  progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  qr_token TEXT NOT NULL UNIQUE,
  source_request_id INTEGER REFERENCES project_requests(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no TEXT NOT NULL UNIQUE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK(type IN ('task','issue')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','triaged','assigned','in_progress','waiting','resolved','closed')),
  assignee_id INTEGER REFERENCES users(id),
  reporter_name TEXT,
  reporter_department TEXT,
  reporter_email TEXT,
  reporter_phone TEXT,
  due_date TEXT,
  resolved_at TEXT,
  source TEXT NOT NULL DEFAULT 'staff' CHECK(source IN ('staff','qr','import')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id INTEGER REFERENCES work_items(id) ON DELETE CASCADE,
  project_request_id INTEGER REFERENCES project_requests(id) ON DELETE CASCADE,
  author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  public_visible INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(work_item_id IS NOT NULL OR project_request_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id INTEGER REFERENCES work_items(id) ON DELETE CASCADE,
  project_request_id INTEGER REFERENCES project_requests(id) ON DELETE CASCADE,
  comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  public_visible INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('planned','in_progress','on_hold','complete_monitoring','completed','cancelled')),
  progress INTEGER NOT NULL CHECK(progress BETWEEN 0 AND 100),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_update_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_update_id INTEGER NOT NULL REFERENCES project_updates(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public_tracking_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  work_item_id INTEGER REFERENCES work_items(id) ON DELETE CASCADE,
  project_request_id INTEGER REFERENCES project_requests(id) ON DELETE CASCADE,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(work_item_id IS NOT NULL OR project_request_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  detail_json TEXT NOT NULL DEFAULT '{}',
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('projects','tickets')),
  payload_json TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  committed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_work_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_work_assignee ON work_items(assignee_id);
CREATE INDEX IF NOT EXISTS idx_work_project ON work_items(project_id);
CREATE INDEX IF NOT EXISTS idx_project_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_project_updates_project ON project_updates(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_update_images_update ON project_update_images(project_update_id);
CREATE INDEX IF NOT EXISTS idx_project_links_project ON project_links(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);
`);

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some(item => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function tableDefinition(table: string) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { sql: string } | undefined;
  return row?.sql ?? "";
}

function ensureProjectStatusCheckAllowsMonitoring() {
  const needsProjects = !tableDefinition("projects").includes("'complete_monitoring'");
  const needsUpdates = !tableDefinition("project_updates").includes("'complete_monitoring'");
  if (!needsProjects && !needsUpdates) return;

  db.pragma("foreign_keys = OFF");
  db.pragma("legacy_alter_table = ON");
  try {
    db.transaction(() => {
      if (needsProjects) {
        db.exec(`
          ALTER TABLE projects RENAME TO __projects_status_migration_old;
          CREATE TABLE projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_no TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            department_id INTEGER REFERENCES departments(id),
            department_name TEXT NOT NULL,
            owner_id INTEGER REFERENCES users(id),
            status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','on_hold','complete_monitoring','completed','cancelled')),
            priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
            start_date TEXT,
            due_date TEXT,
            progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
            qr_token TEXT NOT NULL UNIQUE,
            source_request_id INTEGER REFERENCES project_requests(id),
            current_update TEXT NOT NULL DEFAULT '',
            progress_updated_at TEXT,
            progress_updated_by INTEGER REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO projects(
            id, project_no, name, description, department_id, department_name, owner_id, status, priority,
            start_date, due_date, progress, qr_token, source_request_id, current_update,
            progress_updated_at, progress_updated_by, created_at, updated_at
          )
          SELECT id, project_no, name, description, department_id, department_name, owner_id, status, priority,
            start_date, due_date, progress, qr_token, source_request_id, current_update,
            progress_updated_at, progress_updated_by, created_at, updated_at
          FROM __projects_status_migration_old;
          DROP TABLE __projects_status_migration_old;
        `);
      }
      if (needsUpdates) {
        db.exec(`
          ALTER TABLE project_updates RENAME TO __project_updates_status_migration_old;
          CREATE TABLE project_updates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            author_name TEXT NOT NULL,
            body TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('planned','in_progress','on_hold','complete_monitoring','completed','cancelled')),
            progress INTEGER NOT NULL CHECK(progress BETWEEN 0 AND 100),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO project_updates(id, project_id, author_user_id, author_name, body, status, progress, created_at)
          SELECT id, project_id, author_user_id, author_name, body, status, progress, created_at
          FROM __project_updates_status_migration_old;
          DROP TABLE __project_updates_status_migration_old;
        `);
      }
    })();
  } finally {
    db.pragma("legacy_alter_table = OFF");
    db.pragma("foreign_keys = ON");
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_project_status ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_project_updates_project ON project_updates(project_id, created_at DESC);
  `);
}

ensureColumn("projects", "current_update", "TEXT NOT NULL DEFAULT ''");
ensureColumn("projects", "progress_updated_at", "TEXT");
ensureColumn("projects", "progress_updated_by", "INTEGER REFERENCES users(id)");
ensureProjectStatusCheckAllowsMonitoring();

export function nextIdentifier(kind: "REQ" | "PRJ" | "TKT") {
  const year = kind === "PRJ" ? 0 : malaysiaYear();
  const row = db.prepare("SELECT value FROM counters WHERE name = ? AND year = ?").get(kind, year) as { value: number } | undefined;
  const next = (row?.value ?? 0) + 1;
  db.prepare(`
    INSERT INTO counters(name, year, value) VALUES(?, ?, ?)
    ON CONFLICT(name, year) DO UPDATE SET value = excluded.value
  `).run(kind, year, next);
  if (kind === "PRJ") return `PRJ-${String(next).padStart(4, "0")}`;
  return `${kind}-${year}-${String(next).padStart(kind === "TKT" ? 6 : 4, "0")}`;
}

export async function seedDatabase() {
  db.prepare("INSERT OR IGNORE INTO departments(name, code) VALUES (?, ?)").run("Digital Transformation Unit", "DTU");
  const count = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  if (count.count === 0) {
    if (config.isProduction && ["ChangeMe123!", "REPLACE_WITH_A_LONG_TEMPORARY_PASSWORD"].includes(config.initialAdminPassword)) {
      throw new Error("Set a private INITIAL_ADMIN_PASSWORD in /etc/dtu-control.env before the first production start");
    }
    const hash = await argon2.hash(config.initialAdminPassword, { type: argon2.argon2id });
    db.prepare(`
      INSERT INTO users(username, name, email, password_hash, role, must_change_password)
      VALUES (?, 'DTU Administrator', NULL, ?, 'admin', 1)
    `).run(config.initialAdminUsername, hash);
  }
}

export function resetDatabaseForTests() {
  if (process.env.NODE_ENV !== "test") return;
  for (const table of [
    "project_update_images", "project_updates", "project_links", "attachments", "comments", "notifications", "audit_events", "public_tracking_tokens",
    "work_items", "projects", "project_requests", "sessions", "login_attempts",
    "import_batches", "users", "departments", "counters"
  ]) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
}
