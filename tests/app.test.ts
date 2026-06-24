import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../server/app.js";
import { db, resetDatabaseForTests, seedDatabase } from "../server/db.js";

let cookie = "";
let csrf = "";
let managedUserId = 0;
let adminUserId = 0;

beforeAll(async () => {
  resetDatabaseForTests();
  await seedDatabase();
});

describe("DTU Control Centre API", () => {
  it("reports healthy", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("authenticates the initial administrator", async () => {
    const response = await request(app).post("/api/auth/login").send({ username: "admin", password: "ChangeMe123!" });
    expect(response.status).toBe(200);
    cookie = response.headers["set-cookie"][0].split(";")[0];
    csrf = response.body.csrfToken;
    adminUserId = response.body.user.id;
    expect(response.body.user.role).toBe("admin");
  });

  it("rejects state changes without CSRF", async () => {
    const response = await request(app).post("/api/staff/projects").set("Cookie", cookie).send({ name: "No CSRF" });
    expect(response.status).toBe(403);
  });

  it("creates and safely manages a staff account", async () => {
    const created = await request(app).post("/api/staff/users")
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({
        username: "managed.user",
        name: "Managed User",
        email: "managed@example.com",
        role: "member",
        language: "en",
        password: "Temporary123!"
      });
    expect(created.status).toBe(201);
    managedUserId = created.body.id;

    const updated = await request(app).patch(`/api/staff/users/${managedUserId}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ email: "updated@example.com", active: false });
    expect(updated.status).toBe(200);
    const row = db.prepare("SELECT email, active FROM users WHERE id = ?").get(managedUserId) as { email: string; active: number };
    expect(row.email).toBe("updated@example.com");
    expect(row.active).toBe(0);

    const selfDisable = await request(app).patch(`/api/staff/users/${adminUserId}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ active: false });
    expect(selfDisable.status).toBe(400);
  });

  it("resets a staff password and requires a change on next sign-in", async () => {
    const activated = await request(app).patch(`/api/staff/users/${managedUserId}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ active: true });
    expect(activated.status).toBe(200);

    const reset = await request(app).post(`/api/staff/users/${managedUserId}/reset-password`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ password: "Replacement123!" });
    expect(reset.status).toBe(200);

    const login = await request(app).post("/api/auth/login")
      .send({ username: "managed.user", password: "Replacement123!" });
    expect(login.status).toBe(200);
    expect(login.body.mustChangePassword).toBe(true);
  });

  it("creates a project and accepts a QR issue report", async () => {
    const created = await request(app).post("/api/staff/projects")
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ name: "Smart Production Board", departmentName: "Production", description: "Digital production status", priority: "high" });
    expect(created.status).toBe(201);
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(created.body.id) as { qr_token: string };
    const issue = await request(app).post(`/api/public/projects/${project.qr_token}/issues`)
      .field("reporterName", "Test Reporter").field("department", "Quality")
      .field("title", "Display is offline").field("description", "The display has been offline since this morning.")
      .field("urgency", "high");
    expect(issue.status).toBe(201);
    expect(issue.body.ticketNo).toMatch(/^TKT-/);
    expect(issue.body.trackingUrl).toContain("/track/");
    const storedIssue = db.prepare("SELECT reporter_department, reporter_email FROM work_items WHERE ticket_no = ?").get(issue.body.ticketNo) as { reporter_department: string; reporter_email: string | null };
    expect(storedIssue.reporter_department).toBe("Quality");
    expect(storedIssue.reporter_email).toBeNull();
  });

  it("reports unread notifications and marks them all as read", async () => {
    const summary = await request(app).get("/api/staff/notifications/summary")
      .set("Cookie", cookie);
    expect(summary.status).toBe(200);
    expect(summary.body.unreadCount).toBeGreaterThan(0);

    const marked = await request(app).post("/api/staff/notifications/read-all")
      .set("Cookie", cookie).set("x-csrf-token", csrf);
    expect(marked.status).toBe(200);
    expect(marked.body.updated).toBeGreaterThan(0);

    const refreshed = await request(app).get("/api/staff/notifications/summary")
      .set("Cookie", cookie);
    expect(refreshed.body.unreadCount).toBe(0);
  });

  it("does not expose staff routes on the public hostname", async () => {
    const response = await request(app).get("/api/staff/dashboard").set("Host", process.env.PUBLIC_HOSTNAME || "report.example.com").set("Cookie", cookie);
    if (process.env.PUBLIC_HOSTNAME) expect(response.status).toBe(404);
    else expect([200, 401]).toContain(response.status);
  });

  it("includes completed projects on the wallboard without counting them as active", async () => {
    db.prepare(`
      INSERT INTO projects(project_no, name, description, department_name, status, priority, progress, qr_token)
      VALUES (?, ?, '', ?, 'completed', 'medium', 100, ?)
    `).run("PRJ-COMPLETE", "Completed Wallboard Project", "Quality", "completed-wallboard-token");
    const response = await request(app).get("/api/wallboard");
    expect(response.status).toBe(200);
    expect(response.body.projects.some((project: { project_no: string; status: string }) =>
      project.project_no === "PRJ-COMPLETE" && project.status === "completed"
    )).toBe(true);
    expect(response.body.stats.activeProjects).toBe(1);
  });

  it("allows public intake but blocks the wallboard on the public hostname", async () => {
    const intake = await request(app).get("/api/public/config").set("Host", "report.example.com");
    const wallboard = await request(app).get("/api/wallboard").set("Host", "report.example.com");
    expect(intake.status).toBe(200);
    expect(wallboard.status).toBe(404);
  });
});
