import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, ErrorNotice, Loading } from "./UI";
import { definitionsFromProjects, groupProjectItems, type GroupableProject, type GroupDefinition, type ProjectEntry } from "../projectGroups";
import "./project-groups.css";

const GroupManager = lazy(() => import("../pages/MonthlyReviewPortfolio").then(module => ({ default: module.ProjectGroupManager })));

export function ProjectGroupSummary<T>({ entry }: { entry: ProjectEntry<T> }) {
  return <div className="pg-group-heading"><div><span className="pg-eyebrow">Project group</span><h2>{entry.group?.name}</h2>{entry.group?.summary && <p>{entry.group.summary}</p>}<small>{entry.projects.length} of {entry.group?.total ?? entry.projects.length} projects shown · Average of recorded progress</small></div><div className="pg-group-position"><strong>{entry.progress == null ? "—" : `${entry.progress}%`}</strong>{entry.status && <Badge value={entry.status} />}</div></div>;
}

export function GroupedProjectCollection<T extends GroupableProject>({ projects, definitions, renderProject, gridClassName, grouped: controlled, onGroupingChange, controls = true }: { projects: T[]; definitions?: GroupDefinition[]; renderProject: (project: T) => ReactNode; gridClassName: string; grouped?: boolean; onGroupingChange?: (grouped: boolean) => void; controls?: boolean }) {
  const [localGrouped, setLocalGrouped] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const grouped = controlled ?? localGrouped;
  const entries = groupProjectItems(projects, definitions, grouped);
  const hasGroups = groupProjectItems(projects, definitions).some(entry => entry.group);
  // Keep the original single grid when no groups are configured.
  if (!hasGroups) return <div className={gridClassName}>{projects.map(project => <div className="pg-project-slot" key={project.id}>{renderProject(project)}</div>)}</div>;
  const singles = entries.filter(entry => !entry.group).flatMap(entry => entry.projects);
  return <div className="pg-collection">
    {controls && <div className="pg-view-controls"><span>{projects.length} projects · {entries.length} {grouped ? "entries" : "individual projects"}</span><label>View<select aria-label="Project grouping" value={grouped ? "grouped" : "individual"} onChange={event => { const next = event.target.value === "grouped"; setLocalGrouped(next); onGroupingChange?.(next); }}><option value="grouped">Group related projects</option><option value="individual">Individual projects</option></select></label></div>}
    {grouped ? <>{entries.filter(entry => entry.group).map(entry => <section className="pg-group" key={entry.key}><div className="pg-group-top"><ProjectGroupSummary entry={entry} /><button className="pg-collapse" aria-expanded={!collapsed.has(entry.group!.id)} aria-label={`${collapsed.has(entry.group!.id) ? "Expand" : "Collapse"} ${entry.group!.name}`} onClick={() => setCollapsed(previous => { const next = new Set(previous); next.has(entry.group!.id) ? next.delete(entry.group!.id) : next.add(entry.group!.id); return next; })}>{collapsed.has(entry.group!.id) ? "+" : "−"}</button></div><div className={`pg-group-body${collapsed.has(entry.group!.id) ? " is-collapsed" : ""}`} inert={collapsed.has(entry.group!.id)}><div><div className={gridClassName}>{entry.projects.map(project => <div className="pg-project-slot" key={project.id}>{renderProject(project)}</div>)}</div></div></div></section>)}{singles.length > 0 && <section className="pg-individuals"><div className="pg-individual-heading">Individual projects <small>{singles.length}</small></div><div className={gridClassName}>{singles.map(project => <div className="pg-project-slot" key={project.id}>{renderProject(project)}</div>)}</div></section>}</> : <div className={gridClassName}>{projects.map(project => <div className="pg-project-slot" key={project.id}>{renderProject(project)}</div>)}</div>}
  </div>;
}

export function ProjectGroupControls({ onChanged }: { onChanged: () => unknown }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const root = document.getElementById("root");
    if (!projects || !root) return;
    const previous = root.inert; root.inert = true;
    return () => { root.inert = previous; };
  }, [Boolean(projects)]);
  if (user?.role !== "admin" && user?.role !== "lead") return null;
  const open = async () => { setBusy(true); setError(""); try { setProjects(await api<any[]>("/api/staff/projects")); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } };
  const saved = async () => { setProjects(await api<any[]>("/api/staff/projects")); await onChanged(); };
  return <><button className="button button-secondary" onClick={() => void open()} disabled={busy}>{busy ? "Loading groups…" : "Manage groups"}</button><ErrorNotice message={error} />{projects && <Suspense fallback={<Loading />}><GroupManager portfolio={projects} groups={definitionsFromProjects(projects)} onSaved={saved} onClose={() => setProjects(null)} /></Suspense>}</>;
}

export function ProjectGroupContext({ project, members = [], briefing = false }: { project: GroupableProject; members?: any[]; briefing?: boolean }) {
  if (!project.group_id || !project.group_name) return null;
  return <section className="pg-context" aria-label="Project group"><div><span className="pg-eyebrow">Part of</span><Link to={`/projects?group=${project.group_id}`}><strong>{project.group_name} ↗</strong></Link>{project.group_summary && <p>{project.group_summary}</p>}</div>{members.length > 0 && <nav aria-label="Projects in this group">{members.map(member => <Link key={member.id} aria-current={member.id === project.id ? "page" : undefined} to={`/${briefing ? "briefing" : "projects"}/${member.id}`}>{member.name}<small>{member.progress == null ? "—" : `${member.progress}%`}</small></Link>)}</nav>}</section>;
}
