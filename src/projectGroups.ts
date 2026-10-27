export type GroupableProject = { id: number; name?: string; progress?: number | null; status?: string | null; group_id?: number | null; group_name?: string | null; group_summary?: string | null; group_total?: number };
export type GroupDefinition = { id: number; name: string; summary?: string; project_ids?: number[] };
export type ProjectEntry<T> = { key: string; projects: T[]; group?: { id: number; name: string; summary: string; total: number }; progress: number | null; status: string | null };

export function groupProjectItems<T extends GroupableProject>(projects: T[], definitions: GroupDefinition[] = [], grouped = true): ProjectEntry<T>[] {
  const groups = new Map(definitions.map(group => [group.id, group]));
  const entries: ProjectEntry<T>[] = [];
  const added = new Set<number>();
  for (const project of projects) {
    const definition = project.group_id ? groups.get(project.group_id) : undefined;
    const name = definition?.name || project.group_name;
    const group = grouped && project.group_id && name ? { id: project.group_id, name, summary: definition?.summary || project.group_summary || "", total: definition?.project_ids?.length ?? project.group_total ?? projects.filter(item => item.group_id === project.group_id).length } : undefined;
    if (group && added.has(group.id)) continue;
    const members = group ? projects.filter(item => item.group_id === group.id) : [project];
    const recorded = members.filter(item => item.progress != null && Number.isFinite(Number(item.progress)));
    const statuses = new Set(members.map(item => item.status ?? null));
    entries.push({ key: group ? `group-${group.id}` : `project-${project.id}`, projects: members, group,
      progress: recorded.length ? Math.round(recorded.reduce((sum, item) => sum + Number(item.progress), 0) / recorded.length) : null,
      status: statuses.size === 1 ? members[0].status ?? null : "mixed" });
    if (group) added.add(group.id);
  }
  return entries;
}

export function flattenProjectGroups<T extends GroupableProject>(projects: T[], grouped = true) {
  if (!grouped) return projects;
  const entries = groupProjectItems(projects);
  return [...entries.filter(entry => entry.group), ...entries.filter(entry => !entry.group)].flatMap(entry => entry.projects);
}

export function definitionsFromProjects(projects: GroupableProject[]) {
  return groupProjectItems(projects).flatMap(entry => entry.group ? [{ id: entry.group.id, name: entry.group.name, summary: entry.group.summary, project_ids: entry.projects.map(item => item.id) }] : []);
}
