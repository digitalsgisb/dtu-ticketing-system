import { db } from "./db.js";

export function withTaskProgress<T extends { id: number }>(projects: T[]): Array<T & { task_total: number; task_completed: number; task_progress: number | null }> {
  const totals = new Map<number, { task_total: number; task_completed: number; completion_units: number }>();
  const ids = [...new Set(projects.map(project => project.id))];
  for (let start = 0; start < ids.length; start += 500) {
    const batch = ids.slice(start, start + 500);
    const rows = db.prepare(`SELECT w.project_id, w.status,
      COUNT(a.user_id) AS assignee_total, COUNT(a.completed_at) AS assignee_completed
      FROM work_items w LEFT JOIN work_item_assignees a ON a.work_item_id = w.id
      WHERE w.type = 'task' AND w.project_id IN (${batch.map(() => "?").join(",")})
      GROUP BY w.id`).all(...batch) as Array<{ project_id: number; status: string; assignee_total: number; assignee_completed: number }>;
    for (const row of rows) {
      const current = totals.get(row.project_id) ?? { task_total: 0, task_completed: 0, completion_units: 0 };
      const fraction = row.assignee_total
        ? row.assignee_completed / row.assignee_total
        : ["resolved", "closed"].includes(row.status) ? 1 : 0;
      current.task_total += 1;
      current.task_completed += fraction === 1 ? 1 : 0;
      current.completion_units += fraction;
      totals.set(row.project_id, current);
    }
  }
  return projects.map(project => {
    const { task_total = 0, task_completed = 0, completion_units = 0 } = totals.get(project.id) ?? {};
    return { ...project, task_total, task_completed, task_progress: task_total ? Math.round(completion_units * 100 / task_total) : null };
  });
}
