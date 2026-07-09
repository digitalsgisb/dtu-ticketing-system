import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../server/app.js";
import { db, resetDatabaseForTests, seedDatabase } from "../server/db.js";

let cookie = "";
let csrf = "";
let managedUserId = 0;
let adminUserId = 0;
let managedCookie = "";
let managedCsrf = "";
let briefingProjectId = 0;

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
    managedCookie = login.headers["set-cookie"][0].split(";")[0];
    managedCsrf = login.body.csrfToken;
  });

  it("creates a project and accepts a QR issue report", async () => {
    const created = await request(app).post("/api/staff/projects")
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ name: "Smart Production Board", departmentName: "Production", description: "Digital production status", priority: "high" });
    expect(created.status).toBe(201);
    briefingProjectId = created.body.id;
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

  it("stores up to four titled system links for a project", async () => {
    const updated = await request(app).patch(`/api/staff/projects/${briefingProjectId}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({
        links: [
          { title: "Live system", url: "https://production.example.com" },
          { title: "Admin console", url: "admin.example.com/console" },
          { title: "", url: "" }
        ]
      });
    expect(updated.status).toBe(200);

    const detail = await request(app).get(`/api/staff/projects/${briefingProjectId}`).set("Cookie", cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.links).toHaveLength(2);
    expect(detail.body.links[0]).toMatchObject({ title: "Live system", url: "https://production.example.com/" });
    expect(detail.body.links[1]).toMatchObject({ title: "Admin console", url: "https://admin.example.com/console" });

    const briefingList = await request(app).get("/api/staff/briefing").set("Cookie", cookie);
    expect(briefingList.status).toBe(200);
    const briefingProject = briefingList.body.projects.find((project: { id: number }) => project.id === briefingProjectId);
    expect(briefingProject.links).toHaveLength(2);

    const briefingDetail = await request(app).get(`/api/staff/briefing/projects/${briefingProjectId}`).set("Cookie", cookie);
    expect(briefingDetail.status).toBe(200);
    expect(briefingDetail.body.links[0]).toMatchObject({ title: "Live system", url: "https://production.example.com/" });

    const tooMany = await request(app).patch(`/api/staff/projects/${briefingProjectId}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ links: Array.from({ length: 5 }, (_, index) => ({ title: `Link ${index + 1}`, url: `https://example.com/${index + 1}` })) });
    expect(tooMany.status).toBe(400);
  });

  it("lets admins change and clear a project owner", async () => {
    const assigned = await request(app).patch(`/api/staff/projects/${briefingProjectId}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ ownerId: managedUserId });
    expect(assigned.status).toBe(200);

    const withOwner = await request(app).get(`/api/staff/projects/${briefingProjectId}`).set("Cookie", cookie);
    expect(withOwner.body.project.owner_id).toBe(managedUserId);
    expect(withOwner.body.project.owner_name).toBe("Managed User");

    const cleared = await request(app).patch(`/api/staff/projects/${briefingProjectId}`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ ownerId: null });
    expect(cleared.status).toBe(200);

    const withoutOwner = await request(app).get(`/api/staff/projects/${briefingProjectId}`).set("Cookie", cookie);
    expect(withoutOwner.body.project.owner_id).toBeNull();
    expect(withoutOwner.body.project.owner_name).toBeNull();
  });

  it("lets the project owner publish a progress update", async () => {
    const created = await request(app).post("/api/staff/projects")
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .send({ name: "Owner Progress Project", departmentName: "DTU", ownerId: managedUserId, priority: "high" });
    expect(created.status).toBe(201);

    const updated = await request(app).patch(`/api/staff/projects/${created.body.id}/progress`)
      .set("Cookie", managedCookie).set("x-csrf-token", managedCsrf)
      .field("status", "in_progress")
      .field("progress", "45")
      .field("currentUpdate", "Prototype approved; integration work is now underway.")
      .attach("images", Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]), { filename: "owner-progress.jpg", contentType: "image/jpeg" });
    expect(updated.status).toBe(200);

    const row = db.prepare("SELECT status, progress, current_update, progress_updated_by FROM projects WHERE id = ?").get(created.body.id) as {
      status: string;
      progress: number;
      current_update: string;
      progress_updated_by: number;
    };
    expect(row.status).toBe("in_progress");
    expect(row.progress).toBe(45);
    expect(row.current_update).toContain("integration work");
    expect(row.progress_updated_by).toBe(managedUserId);
    const imageCount = db.prepare(`
      SELECT COUNT(*) AS count FROM project_update_images pui
      JOIN project_updates pu ON pu.id = pui.project_update_id
      WHERE pu.project_id = ?
    `).get(created.body.id) as { count: number };
    expect(imageCount.count).toBe(1);

    const detail = await request(app).get(`/api/staff/projects/${created.body.id}`).set("Cookie", managedCookie);
    expect(detail.status).toBe(200);
    expect(detail.body.updates[0].images).toHaveLength(1);
    const image = await request(app).get(`/api/staff/projects/progress-images/${detail.body.updates[0].images[0].id}`).set("Cookie", managedCookie);
    expect(image.status).toBe(200);
    expect(image.headers["content-type"]).toContain("image/jpeg");
  });

  it("blocks members from publishing progress updates on projects they do not own", async () => {
    const project = db.prepare("SELECT id FROM projects WHERE owner_id IS NULL ORDER BY id LIMIT 1").get() as { id: number };
    const response = await request(app).patch(`/api/staff/projects/${project.id}/progress`)
      .set("Cookie", managedCookie).set("x-csrf-token", managedCsrf)
      .field("status", "in_progress")
      .field("progress", "50")
      .field("currentUpdate", "Member added a field update with supporting evidence.")
      .attach("images", Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]), { filename: "member-field.jpg", contentType: "image/jpeg" });
    expect(response.status).toBe(403);
  });

  it("limits the progress briefing to admins and leads", async () => {
    const memberView = await request(app).get("/api/staff/briefing").set("Cookie", managedCookie);
    expect(memberView.status).toBe(403);

    const adminView = await request(app).get("/api/staff/briefing").set("Cookie", cookie);
    expect(adminView.status).toBe(200);
    expect(adminView.body.projects.some((project: { id: number }) => project.id === briefingProjectId)).toBe(true);
  });

  it("generates the employee project request QR", async () => {
    const response = await request(app).get("/api/staff/requests/intake-qr").set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body.url).toMatch(/\/request$/);
    expect(response.body.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("publishes a briefing update with a protected progress photo", async () => {
    const response = await request(app).post(`/api/staff/briefing/projects/${briefingProjectId}/updates`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .field("status", "in_progress")
      .field("progress", "60")
      .field("currentUpdate", "Management review completed; rollout preparation has started.")
      .attach("images", Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]), { filename: "progress.jpg", contentType: "image/jpeg" });
    expect(response.status).toBe(201);

    const detail = await request(app).get(`/api/staff/briefing/projects/${briefingProjectId}`).set("Cookie", cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.project.progress).toBe(60);
    expect(detail.body.updates[0].body).toContain("rollout preparation");
    expect(detail.body.updates[0].images).toHaveLength(1);

    const image = await request(app).get(`/api/staff/briefing/images/${detail.body.updates[0].images[0].id}`).set("Cookie", cookie);
    expect(image.status).toBe(200);
    expect(image.headers["content-type"]).toContain("image/jpeg");

    const memberImage = await request(app).get(`/api/staff/briefing/images/${detail.body.updates[0].images[0].id}`).set("Cookie", managedCookie);
    expect(memberImage.status).toBe(403);
  });

  it("accepts complete and monitoring as a project status", async () => {
    const response = await request(app).post(`/api/staff/briefing/projects/${briefingProjectId}/updates`)
      .set("Cookie", cookie).set("x-csrf-token", csrf)
      .field("status", "complete_monitoring")
      .field("progress", "65")
      .field("currentUpdate", "Rollout is complete; DTU is monitoring the live usage window.");
    expect(response.status).toBe(201);

    const project = db.prepare("SELECT status, progress, current_update FROM projects WHERE id = ?").get(briefingProjectId) as {
      status: string;
      progress: number;
      current_update: string;
    };
    expect(project.status).toBe("complete_monitoring");
    expect(project.progress).toBe(100);
    expect(project.current_update).toContain("monitoring");
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
    const activeBefore = (db.prepare("SELECT COUNT(*) AS count FROM projects WHERE status IN ('planned','in_progress','on_hold','complete_monitoring')").get() as { count: number }).count;
    db.prepare(`
      INSERT INTO projects(project_no, name, description, department_name, status, priority, progress, qr_token)
      VALUES (?, ?, '', ?, 'completed', 'medium', 100, ?)
    `).run("PRJ-COMPLETE", "Completed Wallboard Project", "Quality", "completed-wallboard-token");
    const response = await request(app).get("/api/wallboard");
    expect(response.status).toBe(200);
    expect(response.body.projects.some((project: { project_no: string; status: string }) =>
      project.project_no === "PRJ-COMPLETE" && project.status === "completed"
    )).toBe(true);
    expect(response.body.stats.activeProjects).toBe(activeBefore);
  });

  it("allows public intake but blocks the wallboard on the public hostname", async () => {
    const intake = await request(app).get("/api/public/config").set("Host", "report.example.com");
    const wallboard = await request(app).get("/api/wallboard").set("Host", "report.example.com");
    expect(intake.status).toBe(200);
    expect(wallboard.status).toBe(404);
  });

  it("serves public branding while keeping staff login private", async () => {
    const logo = await request(app).get("/sugihara-grand-logo.png").set("Host", "report.example.com");
    const favicon = await request(app).get("/dtu-favicon.svg").set("Host", "report.example.com");
    const login = await request(app).get("/login").set("Host", "report.example.com");
    expect(logo.status).toBe(200);
    expect(logo.headers["content-type"]).toContain("image/png");
    expect(favicon.status).toBe(200);
    expect(favicon.headers["content-type"]).toContain("image/svg+xml");
    expect(login.status).toBe(404);
  });
});
