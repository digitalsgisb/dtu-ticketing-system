import { db } from "./db.js";

export function withTaskProgress<T extends { id: number }>(projects: T[]): Array<T & { task_total: number; task_completed: number; task_progress: number | null }> {
  const totals = new Map<number, { task_total: number; task_completed: number }>();
  const ids = [...new Set(projects.map(project => project.id))];
  for (let start = 0; start < ids.length; start += 500) {
    const batch = ids.slice(start, start + 500);
    const rows = db.prepare(`SELECT project_id,
      COUNT(*) AS task_total,
      SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) AS task_completed
      FROM work_items WHERE type = 'task' AND project_id IN (${batch.map(() => "?").join(",")})
      GROUP BY project_id`).all(...batch) as Array<{ project_id: number; task_total: number; task_completed: number }>;
    for (const row of rows) totals.set(row.project_id, row);
  }
  return projects.map(project => {
    const { task_total = 0, task_completed = 0 } = totals.get(project.id) ?? {};
    return { ...project, task_total, task_completed, task_progress: task_total ? Math.round(task_completed * 100 / task_total) : null };
  });
}
