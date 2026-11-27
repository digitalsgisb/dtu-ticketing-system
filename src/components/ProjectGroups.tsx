import { lazy, Suspense, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useLiveRefresh } from "../live";
import { Badge } from "./UI";
import { ExternalIcon, PencilIcon } from "./Icons";
import { definitionsFromProjects, groupProjectItems, type GroupableProject, type GroupDefinition, type GroupLink, type ProjectEntry } from "../projectGroups";
import { applyDefinitionOverrides, applyGroupOverrides, closeGroupEditor, dismissGroupToast, groupSaveState, openGroupEditor, reportGroupError, useGroupEditing } from "../groupEditing";
import "./project-groups.css";

const GroupManager = lazy(() => import("../pages/MonthlyReviewPortfolio").then(module => ({ default: module.ProjectGroupManager })));

export function systemHost(value: string) {
  try {
    const parsed = new URL(value);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return value;
  }
}

function useCanEditGroups() {
  const { user } = useAuth();
  return user?.role === "admin" || user?.role === "lead";
}

/** A group's shared systems: the first link is the primary "Open" action, the rest sit beside it as chips. */
export function GroupSystemLinks({ links, groupName }: { links?: GroupLink[]; groupName: string }) {
  if (!links?.length) return null;
  const [primary, ...others] = links;
  return <div className="pg-systems" aria-label={`${groupName} system links`} role="group">
    <a className="pg-system-primary" href={primary.url} target="_blank" rel="noreferrer">
      <span className="pg-system-glyph"><ExternalIcon /></span>
      <span className="pg-system-copy"><strong>Open {primary.title}</strong><small>{systemHost(primary.url)}</small></span>
    </a>
    {others.map(link => <a className="pg-system-chip" key={link.id ?? link.url} href={link.url} target="_blank" rel="noreferrer" title={link.url}>
      <span>{link.title}</span><ExternalIcon />
    </a>)}
  </div>;
}

/** Opens the group editor straight on this group. Only admins and leads see it. */
export function GroupEditButton({ id, name, compact = false }: { id: number; name: string; compact?: boolean }) {
  const canEdit = useCanEditGroups();
  const { overrides } = useGroupEditing();
  if (!canEdit) return null;
  const pending = id < 0 || groupSaveState(id, overrides) !== undefined;
  return <button type="button" className={`pg-edit${compact ? " is-compact" : ""}`} disabled={pending} onClick={() => openGroupEditor(id)} aria-label={`Edit group ${name}`} title={pending ? "Saving…" : `Edit ${name}`}>
    <PencilIcon /><span>{pending ? "Saving…" : "Edit"}</span>
  </button>;
}

export function ProjectGroupSummary<T>({ entry }: { entry: ProjectEntry<T> }) {
  return <div className="pg-group-heading"><div><span className="pg-eyebrow">Project group</span><h2>{entry.group?.name}</h2>{entry.group?.summary && <p>{entry.group.summary}</p>}<GroupSystemLinks links={entry.group?.links} groupName={entry.group?.name ?? ""} /><small>{entry.projects.length} of {entry.group?.total ?? entry.projects.length} projects shown · Average of recorded progress</small></div><div className="pg-group-position"><strong>{entry.progress == null ? "—" : `${entry.progress}%`}</strong>{entry.status && <Badge value={entry.status} />}</div></div>;
}

const expandedStorageKey = "dtu-expanded-project-groups";
function readExpanded() {
  try { return new Set<number>(JSON.parse(localStorage.getItem(expandedStorageKey) ?? "[]")); } catch { return new Set<number>(); }
}
function storeExpanded(ids: Set<number>) {
  try { localStorage.setItem(expandedStorageKey, JSON.stringify([...ids])); } catch { /* per-viewer convenience only */ }
}
const morphEase = "pg-morph";
/** Morph between card and full-width group with the browser's view transitions (instant where unsupported or reduced motion). */
function morph(update: () => void) {
  const doc = document as Document & { startViewTransition?: (callback: () => void) => { finished: Promise<void> } };
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)")?.matches;
  if (!doc.startViewTransition || reduced) { update(); return; }
  document.documentElement.classList.add(morphEase);
  doc.startViewTransition(() => flushSync(update)).finished.finally(() => document.documentElement.classList.remove(morphEase));
}
const transitionName = (kind: string, id: number) => ({ viewTransitionName: `pg-${kind}-${id < 0 ? `n${-id}` : id}` }) as CSSProperties;

/** A collapsed group, sized like a project card: a fanned stack of member photos, the group's position, and its main system. */
function GroupCard<T extends GroupableProject>({ entry, imageFor, saving, onExpand }: { entry: ProjectEntry<T>; imageFor?: (project: T) => string | undefined; saving: boolean; onExpand: () => void }) {
  const group = entry.group!;
  const photos = entry.projects.flatMap(project => { const src = imageFor?.(project); return src ? [src] : []; }).slice(0, 3);
  const shown = entry.projects.length;
  return <article className={`pg-card${saving ? " is-saving" : ""}`} style={transitionName("group", group.id)} aria-busy={saving}>
    <button type="button" className={`pg-card-visual${photos.length ? " has-photos" : ""}`} onClick={onExpand} aria-label={`Show ${shown} ${shown === 1 ? "project" : "projects"} in ${group.name}`}>
      {photos.length ? <span className="pg-card-stack" data-count={photos.length}>{photos.map((src, index) => <img key={src} src={src} alt="" style={{ "--i": index } as CSSProperties} />)}</span> : null}
      <span className="pg-card-count"><strong>{group.total}</strong>{group.total === 1 ? "project" : "projects"}</span>
    </button>
    <div className="pg-card-body">
      <div className="pg-card-meta"><span className="pg-eyebrow">Project group</span>{entry.status && <Badge value={entry.status} />}</div>
      <h3>{group.name}</h3>
      {group.summary && <p className="pg-card-summary">{group.summary}</p>}
      <div className="pg-card-progress"><span>Average progress</span><strong>{entry.progress == null ? "—" : `${entry.progress}%`}</strong></div>
      <div className="pg-card-bar" aria-hidden="true"><i style={{ width: `${entry.progress ?? 0}%` }} /></div>
      <ul className="pg-card-members" aria-label={`Projects in ${group.name}`}>{entry.projects.slice(0, 3).map(project => <li key={project.id}>{project.name}</li>)}{shown > 3 && <li className="is-more">+{shown - 3} more</li>}</ul>
    </div>
    <div className="pg-card-actions">
      <div className="pg-card-row"><button type="button" className="pg-card-expand" onClick={onExpand} aria-label={`Expand ${group.name}`}>Show {shown === 1 ? "project" : `${shown} projects`} <span aria-hidden="true">+</span></button><GroupEditButton id={group.id} name={group.name} /></div>
      <GroupSystemLinks links={group.links} groupName={group.name} />
    </div>
  </article>;
}

export function GroupedProjectCollection<T extends GroupableProject>({ projects: loaded, definitions: loadedDefinitions, renderProject, gridClassName, grouped: controlled, onGroupingChange, controls = true, imageFor, startExpanded = false }: { projects: T[]; definitions?: GroupDefinition[]; renderProject: (project: T) => ReactNode; gridClassName: string; grouped?: boolean; onGroupingChange?: (grouped: boolean) => void; controls?: boolean; imageFor?: (project: T) => string | undefined; startExpanded?: boolean }) {
  const [localGrouped, setLocalGrouped] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(() => startExpanded ? new Set() : readExpanded());
  const { overrides } = useGroupEditing();
  const projects = applyGroupOverrides(loaded, overrides);
  const definitions = applyDefinitionOverrides(loadedDefinitions, overrides);
  const grouped = controlled ?? localGrouped;
  const entries = groupProjectItems(projects, definitions, grouped);
  const hasGroups = groupProjectItems(projects, definitions).some(entry => entry.group);
  // Keep the original single grid when no groups are configured.
  if (!hasGroups) return <div className={gridClassName}>{projects.map(project => <div className="pg-project-slot" key={project.id}>{renderProject(project)}</div>)}</div>;
  const groupEntries = entries.filter(entry => entry.group);
  const singles = entries.filter(entry => !entry.group).flatMap(entry => entry.projects);
  // Views filtered to one group, and the wallboard, always show their projects.
  const isOpen = (id: number) => startExpanded || expanded.has(id);
  const toggle = (id: number) => morph(() => setExpanded(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); storeExpanded(next); return next; }));
  const slot = (project: T) => <div className="pg-project-slot" key={project.id} style={transitionName("project", project.id)}>{renderProject(project)}</div>;
  return <div className="pg-collection">
    {controls && <div className="pg-view-controls"><span>{projects.length} projects · {entries.length} {grouped ? "entries" : "individual projects"}</span><label>View<select aria-label="Project grouping" value={grouped ? "grouped" : "individual"} onChange={event => { const next = event.target.value === "grouped"; setLocalGrouped(next); onGroupingChange?.(next); }}><option value="grouped">Group related projects</option><option value="individual">Individual projects</option></select></label></div>}
    {grouped ? <>
      <div className={`${gridClassName} pg-group-grid`}>{groupEntries.map(entry => {
        const group = entry.group!;
        const saving = group.id < 0 || groupSaveState(group.id, overrides) !== undefined;
        if (!isOpen(group.id)) return <div className="pg-project-slot" key={entry.key}><GroupCard entry={entry} imageFor={imageFor} saving={saving} onExpand={() => toggle(group.id)} /></div>;
        return <section className={`pg-group${saving ? " is-saving" : ""}`} key={entry.key} style={transitionName("group", group.id)} aria-busy={saving}>
          <div className="pg-group-top"><ProjectGroupSummary entry={entry} /><div className="pg-group-tools"><GroupEditButton id={group.id} name={group.name} />{!startExpanded && <button className="pg-collapse" aria-expanded="true" aria-label={`Collapse ${group.name}`} onClick={() => toggle(group.id)}>−</button>}</div></div>
          <div className="pg-group-body"><div className={gridClassName}>{entry.projects.map(slot)}</div></div>
        </section>;
      })}</div>
      {singles.length > 0 && <section className="pg-individuals"><div className="pg-individual-heading">Individual projects <small>{singles.length}</small></div><div className={gridClassName}>{singles.map(slot)}</div></section>}
    </> : <div className={gridClassName}>{projects.map(slot)}</div>}
  </div>;
}

export function ProjectGroupControls() {
  if (!useCanEditGroups()) return null;
  return <button className="button button-secondary" onClick={() => openGroupEditor(null)}>Manage groups</button>;
}

export function ProjectGroupContext({ project: loaded, members: loadedMembers = [], briefing = false }: { project: GroupableProject; members?: any[]; briefing?: boolean }) {
  const { overrides } = useGroupEditing();
  const [project] = applyGroupOverrides([loaded], overrides);
  if (!project.group_id || !project.group_name) return null;
  const members = applyGroupOverrides(loadedMembers as GroupableProject[], overrides).filter(member => member.group_id === project.group_id);
  const saving = groupSaveState(project.group_id, overrides) !== undefined;
  return <section className={`pg-context${saving ? " is-saving" : ""}`} aria-label="Project group" aria-busy={saving}>
    <div className="pg-context-top"><div><span className="pg-eyebrow">Part of</span><Link to={`/projects?group=${project.group_id}`}><strong>{project.group_name} ↗</strong></Link></div><GroupEditButton id={project.group_id} name={project.group_name} compact /></div>
    {project.group_summary && <p>{project.group_summary}</p>}<GroupSystemLinks links={project.group_links} groupName={project.group_name} />
    {members.length > 0 && <nav aria-label="Projects in this group">{members.map(member => <Link key={member.id} aria-current={member.id === project.id ? "page" : undefined} to={`/${briefing ? "briefing" : "projects"}/${member.id}`}>{member.name}<small>{member.progress == null ? "—" : `${member.progress}%`}</small></Link>)}</nav>}
  </section>;
}

/** Mounted once (in the layout): the group editor dialog and the save-status toast for every page. */
export function GroupEditorHost() {
  const { editor, toast } = useGroupEditing();
  return <>
    {editor && <GroupEditorDialog key={`${editor.groupId ?? "new"}-${editor.draft ? "draft" : "fresh"}`} groupId={editor.groupId} draft={editor.draft} closing={Boolean(editor.closing)} />}
    {toast && createPortal(<div className={`pg-toast is-${toast.tone}`} key={toast.id} role={toast.tone === "error" ? "alert" : "status"} aria-live={toast.tone === "error" ? "assertive" : "polite"}>
      <span className="pg-toast-mark" aria-hidden="true" />
      <span className="pg-toast-message">{toast.message}</span>
      {toast.retry && <button type="button" onClick={() => { openGroupEditor(toast.retry!.groupId, toast.retry!.draft); dismissGroupToast(); }}>Try again</button>}
      {toast.tone !== "progress" && <button type="button" className="pg-toast-close" onClick={dismissGroupToast} aria-label="Dismiss message">×</button>}
    </div>, document.body)}
  </>;
}

function GroupEditorDialog({ groupId, draft, closing }: { groupId: number | null; draft?: Parameters<typeof openGroupEditor>[1]; closing: boolean }) {
  const { overrides } = useGroupEditing();
  const [portfolio, setPortfolio] = useState<any[] | null>(null);
  const load = () => api<any[]>("/api/staff/projects").then(setPortfolio);
  useEffect(() => { load().catch(error => reportGroupError(`Groups could not be opened. ${(error as Error).message}`)); }, []);
  useLiveRefresh(load);
  useEffect(() => {
    const root = document.getElementById("root");
    if (!portfolio || !root) return;
    const previous = root.inert; root.inert = true;
    return () => { root.inert = previous; };
  }, [Boolean(portfolio)]);
  if (!portfolio) return null;
  const projects = applyGroupOverrides(portfolio as GroupableProject[], overrides) as any[];
  const groups = definitionsFromProjects(projects).map(group => ({ ...group, summary: group.summary ?? "", project_ids: group.project_ids ?? [] }));
  return <Suspense fallback={null}><GroupManager portfolio={projects} groups={groups} focusGroupId={groupId} initialDraft={draft} onClose={closeGroupEditor} closing={closing} /></Suspense>;
}
