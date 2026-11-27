import { db } from "./db.js";

export type GroupLink = { id: number; title: string; url: string; sort_order: number };

/** System links owned by each group, in display order. The first link is the group's primary system. */
export function groupLinksFor(groupIds: Iterable<number>) {
  const ids = [...new Set(groupIds)];
  const links = new Map<number, GroupLink[]>(ids.map(id => [id, []]));
  for (let start = 0; start < ids.length; start += 500) {
    const batch = ids.slice(start, start + 500);
    const rows = db.prepare(`SELECT id, group_id, title, url, sort_order FROM project_group_links
      WHERE group_id IN (${batch.map(() => "?").join(",")}) ORDER BY sort_order, id`).all(...batch) as Array<GroupLink & { group_id: number }>;
    rows.forEach(({ group_id, ...link }) => links.get(group_id)!.push(link));
  }
  return links;
}

export function replaceGroupLinks(groupId: number, links: Array<{ title: string; url: string }>) {
  db.prepare("DELETE FROM project_group_links WHERE group_id = ?").run(groupId);
  const insert = db.prepare("INSERT INTO project_group_links(group_id, title, url, sort_order) VALUES (?, ?, ?, ?)");
  links.forEach((link, index) => insert.run(groupId, link.title, link.url, index));
}

/** Add current grouping metadata without changing the selected project rows or order. Public views never receive group links. */
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
  const links = publicSafe ? new Map<number, GroupLink[]>() : groupLinksFor([...metadata.values()].flatMap(group => group.group_id ? [group.group_id] : []));
  return projects.map(project => {
    const group = metadata.get(project.id) ?? { group_id: null, group_name: null, group_total: 0 };
    return { ...project, ...group, ...(publicSafe ? {} : { group_links: group.group_id ? links.get(group.group_id) ?? [] : [] }),
      ...(publicSafe && group.group_id ? { group_total: projects.filter(item => metadata.get(item.id)?.group_id === group.group_id).length } : {}) };
  });
}

export function projectGroupMembers(projectId: number | string) {
  return withProjectGroups(db.prepare(`SELECT p.id, p.name, p.project_no, p.status, p.progress, p.owner_id,
    owner.name AS owner_name FROM projects p LEFT JOIN users owner ON owner.id = p.owner_id
    WHERE p.group_id = (SELECT group_id FROM projects WHERE id = ?) ORDER BY p.name COLLATE NOCASE, p.id`).all(projectId) as Array<{ id: number }>);
}
