import { db } from "./db.js";

type Assignee = { id: number; name: string; completed_at: string | null; completion_comment_id: number | null };

export function assigneesFor(workItemId: number) {
  return db.prepare(`
    SELECT u.id, u.name, a.completed_at, a.completion_comment_id FROM work_item_assignees a
    JOIN users u ON u.id = a.user_id WHERE a.work_item_id = ? ORDER BY u.name
  `).all(workItemId) as Assignee[];
}

export function withAssignees<T extends { id: number }>(rows: T[]): Array<T & { assignees: Assignee[]; assignee_name: string | null; assignee_total: number; assignee_completed: number }> {
  const byItem = new Map<number, Assignee[]>();
  const ids = [...new Set(rows.map(row => row.id))];
  for (let start = 0; start < ids.length; start += 500) {
    const batch = ids.slice(start, start + 500);
    const assigned = db.prepare(`SELECT a.work_item_id, u.id, u.name, a.completed_at, a.completion_comment_id FROM work_item_assignees a
      JOIN users u ON u.id = a.user_id WHERE a.work_item_id IN (${batch.map(() => "?").join(",")}) ORDER BY u.name`)
      .all(...batch) as Array<{ work_item_id: number } & Assignee>;
    for (const user of assigned) {
      if (!byItem.has(user.work_item_id)) byItem.set(user.work_item_id, []);
      byItem.get(user.work_item_id)!.push({ id: user.id, name: user.name, completed_at: user.completed_at, completion_comment_id: user.completion_comment_id });
    }
  }
  return rows.map(row => {
    const assignees = byItem.get(row.id) ?? [];
    return { ...row, assignees, assignee_name: assignees.map(user => user.name).join(", ") || null,
      assignee_total: assignees.length, assignee_completed: assignees.filter(user => user.completed_at).length };
  });
}

export function replaceAssignees(workItemId: number, userIds: number[]) {
  if (userIds.length) db.prepare(`DELETE FROM work_item_assignees WHERE work_item_id = ? AND user_id NOT IN (${userIds.map(() => "?").join(",")})`).run(workItemId, ...userIds);
  else db.prepare("DELETE FROM work_item_assignees WHERE work_item_id = ?").run(workItemId);
  const insert = db.prepare("INSERT OR IGNORE INTO work_item_assignees(work_item_id, user_id) VALUES (?, ?)");
  for (const userId of userIds) insert.run(workItemId, userId);
  db.prepare("UPDATE work_items SET assignee_id = ? WHERE id = ?").run(userIds[0] ?? null, workItemId);
}

export function taskAssigneeProgress(workItemId: number) {
  return db.prepare(`SELECT COUNT(*) AS total, COUNT(completed_at) AS completed
    FROM work_item_assignees WHERE work_item_id = ?`).get(workItemId) as { total: number; completed: number };
}

export function reconcileTaskStatus(workItemId: number) {
  const item = db.prepare("SELECT type, status, completion_mode FROM work_items WHERE id = ?").get(workItemId) as { type: string; status: string; completion_mode: string } | undefined;
  if (!item || item.completion_mode === "group") return;
  const { total, completed } = taskAssigneeProgress(workItemId);
  if (!total) return;
  if (completed === total && !["resolved", "closed"].includes(item.status)) {
    db.prepare("UPDATE work_items SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(workItemId);
  } else if (completed < total && ["resolved", "closed"].includes(item.status)) {
    db.prepare("UPDATE work_items SET status = 'in_progress', resolved_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(workItemId);
  }
}

export function validAssignees(userIds: number[]) {
  if (new Set(userIds).size !== userIds.length) return false;
  if (!userIds.length) return true;
  const count = db.prepare(`SELECT COUNT(*) AS count FROM users WHERE active = 1 AND id IN (${userIds.map(() => "?").join(",")})`).get(...userIds) as { count: number };
  return count.count === userIds.length;
}
