import { app } from "./app.js";
import { config } from "./config.js";
import { db, seedDatabase } from "./db.js";
import { notify } from "./services.js";
import { malaysiaDate } from "./time.js";

await seedDatabase();

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`DTU Control Centre listening on http://0.0.0.0:${config.port}`);
});

const deadlineTimer = setInterval(() => {
  const today = malaysiaDate();
  const reminderEnd = malaysiaDate(3);
  const users = db.prepare("SELECT id FROM users WHERE active = 1").all() as { id: number }[];
  for (const user of users) {
    const items = db.prepare(`
      SELECT id, ticket_no, title, due_date FROM work_items
      WHERE assignee_id = ? AND status NOT IN ('resolved','closed')
        AND due_date BETWEEN ? AND ?
        AND NOT EXISTS (
          SELECT 1 FROM notifications n WHERE n.user_id = ? AND n.type = 'deadline'
            AND n.link = '/tickets/' || work_items.id AND date(n.created_at, '+8 hours') = ?
        )
    `).all(user.id, today, reminderEnd, user.id, today) as { id: number; ticket_no: string; title: string; due_date: string }[];
    for (const item of items) notify(user.id, "deadline", `${item.ticket_no} is due soon`, `${item.title} · ${item.due_date}`, `/tickets/${item.id}`);
  }
}, 60 * 60 * 1000);
deadlineTimer.unref();

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
