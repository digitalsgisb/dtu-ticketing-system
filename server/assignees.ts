import { db } from "./db.js";

export function assigneesFor(workItemId: number) {
  return db.prepare(`
    SELECT u.id, u.name FROM work_item_assignees a
    JOIN users u ON u.id = a.user_id WHERE a.work_item_id = ? ORDER BY u.name
  `).all(workItemId) as Array<{ id: number; name: string }>;
}

export function withAssignees<T extends { id: number }>(rows: T[]): Array<T & { assignees: Array<{ id: number; name: string }>; assignee_name: string | null }> {
  const byItem = new Map<number, Array<{ id: number; name: string }>>();
  const ids = [...new Set(rows.map(row => row.id))];
  for (let start = 0; start < ids.length; start += 500) {
    const batch = ids.slice(start, start + 500);
    const assigned = db.prepare(`SELECT a.work_item_id, u.id, u.name FROM work_item_assignees a
      JOIN users u ON u.id = a.user_id WHERE a.work_item_id IN (${batch.map(() => "?").join(",")}) ORDER BY u.name`)
      .all(...batch) as Array<{ work_item_id: number; id: number; name: string }>;
    for (const user of assigned) {
      if (!byItem.has(user.work_item_id)) byItem.set(user.work_item_id, []);
      byItem.get(user.work_item_id)!.push({ id: user.id, name: user.name });
    }
  }
  return rows.map(row => {
    const assignees = byItem.get(row.id) ?? [];
    return { ...row, assignees, assignee_name: assignees.map(user => user.name).join(", ") || null };
  });
}

export function replaceAssignees(workItemId: number, userIds: number[]) {
  db.prepare("DELETE FROM work_item_assignees WHERE work_item_id = ?").run(workItemId);
  const insert = db.prepare("INSERT INTO work_item_assignees(work_item_id, user_id) VALUES (?, ?)");
  for (const userId of userIds) insert.run(workItemId, userId);
  db.prepare("UPDATE work_items SET assignee_id = ? WHERE id = ?").run(userIds[0] ?? null, workItemId);
}

export function validAssignees(userIds: number[]) {
  if (new Set(userIds).size !== userIds.length) return false;
  if (!userIds.length) return true;
  const count = db.prepare(`SELECT COUNT(*) AS count FROM users WHERE active = 1 AND id IN (${userIds.map(() => "?").join(",")})`).get(...userIds) as { count: number };
  return count.count === userIds.length;
}
