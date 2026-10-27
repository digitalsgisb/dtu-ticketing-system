import { db } from "./db.js";

/** Add current grouping metadata without changing the selected project rows or order. */
export function withProjectGroups<T extends { id: number }>(projects: T[], publicSafe = false) {
  const metadata = new Map<number, { group_id: number | null; group_name: string | null; group_summary?: string | null; group_total: number }>();
  for (let start = 0; start < projects.length; start += 500) {
    const ids = projects.slice(start, start + 500).map(project => project.id);
    const rows = db.prepare(`SELECT p.id, p.group_id, g.name AS group_name, g.summary AS group_summary,
      (SELECT COUNT(*) FROM projects child WHERE child.group_id = g.id) AS group_total
      FROM projects p LEFT JOIN project_groups g ON g.id = p.group_id
      WHERE p.id IN (${ids.map(() => "?").join(",")})`).all(...ids) as Array<{ id: number; group_id: number | null; group_name: string | null; group_summary: string | null; group_total: number }>;
    rows.forEach(({ id, ...group }) => metadata.set(id, publicSafe ? { group_id: group.group_id, group_name: group.group_name, group_total: 0 } : group));
  }
  return projects.map(project => {
    const group = metadata.get(project.id) ?? { group_id: null, group_name: null, group_total: 0 };
    return { ...project, ...group, ...(publicSafe && group.group_id ? { group_total: projects.filter(item => metadata.get(item.id)?.group_id === group.group_id).length } : {}) };
  });
}

export function projectGroupMembers(projectId: number | string) {
  return withProjectGroups(db.prepare(`SELECT p.id, p.name, p.project_no, p.status, p.progress, p.owner_id,
    owner.name AS owner_name FROM projects p LEFT JOIN users owner ON owner.id = p.owner_id
    WHERE p.group_id = (SELECT group_id FROM projects WHERE id = ?) ORDER BY p.name COLLATE NOCASE, p.id`).all(projectId) as Array<{ id: number }>);
}
