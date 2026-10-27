import { useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { Badge, Empty, ErrorNotice } from "../components/UI";
import type { Item } from "./MonthlyReview";

export type ProjectGroup = { id: number; name: string; summary: string; project_ids: number[] };
export type PortfolioSelection = { kind: "project" | "group"; id: number };
type PortfolioRow = { key: string; name: string; summary: string; category: string; department: string; progress: number | null; status: string | null; members: Item[]; group?: ProjectGroup };

export function portfolioRows(items: Item[], groups: ProjectGroup[], grouped: boolean): PortfolioRow[] {
  const single = (item: Item): PortfolioRow => ({ key: `p-${item.id}`, name: item.name || "Untitled project", summary: item.description || item.current_update || "", category: item.reporting_category || "Other", department: item.department_name, progress: item.progress, status: item.status, members: [item] });
  if (!grouped) return items.map(single);
  const groupMap = new Map(groups.map(group => [group.id, group]));
  const result: PortfolioRow[] = [];
  const added = new Set<number>();
  for (const item of items) {
    const group = item.group_id ? groupMap.get(item.group_id) : undefined;
    if (!group) { result.push(single(item)); continue; }
    if (added.has(group.id)) continue;
    added.add(group.id);
    const members = items.filter(project => project.group_id === group.id);
    const recorded = members.filter(project => project.progress != null);
    const statuses = new Set(members.map(project => project.status));
    result.push({ key: `g-${group.id}`, name: group.name, summary: group.summary || members.map(project => project.name).join(" · "),
      category: [...new Set(members.map(project => project.reporting_category || "Other"))].join(" · "),
      department: [...new Set(members.map(project => project.department_name))].join(" · "),
      progress: recorded.length ? Math.round(recorded.reduce((sum, project) => sum + project.progress!, 0) / recorded.length) : null,
      status: statuses.size === 1 ? members[0].status : "mixed", members, group });
  }
  return result;
}

function ProgressValue({ value }: { value: number | null }) {
  return value == null ? <span className="mr-unrecorded">Unrecorded</span> : <div className="mr-table-progress"><strong>{value}%</strong><span><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span></div>;
}

export function ProjectOverviewTable({ items, groups, onOpen }: { items: Item[]; groups: ProjectGroup[]; onOpen: (selection: PortfolioSelection) => void }) {
  const [grouped, setGrouped] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const rows = portfolioRows(items, groups, grouped);
  const row = (entry: PortfolioRow, number: string, child = false) => <tr key={`${number}-${entry.key}`} className={entry.group ? "mr-group-row" : child ? "mr-child-row" : ""} onClick={event => { event.currentTarget.querySelector<HTMLButtonElement>(".mr-project-name")?.focus(); onOpen({ kind: entry.group ? "group" : "project", id: entry.group?.id ?? entry.members[0].id }); }}>
    <td className="mr-row-number">{number}</td><td><div className="mr-table-name">{entry.group && <button className="mr-expand-group" aria-label={`${expanded.has(entry.group.id) ? "Collapse" : "Expand"} ${entry.name}`} aria-expanded={expanded.has(entry.group.id)} onClick={event => { event.stopPropagation(); const id = entry.group!.id; setExpanded(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; }); }}>{expanded.has(entry.group.id) ? "−" : "+"}</button>}<button className="mr-project-name" onClick={event => { event.stopPropagation(); onOpen({ kind: entry.group ? "group" : "project", id: entry.group?.id ?? entry.members[0].id }); }}>{entry.name}</button></div><small>{entry.group ? `Group · ${entry.members.length} of ${entry.group.project_ids.length} projects shown` : entry.members[0].project_no}</small></td>
    <td>{entry.category}</td><td>{entry.department}</td><td><p className="mr-table-summary">{entry.summary || "No summary added yet."}</p></td><td><ProgressValue value={entry.progress} />{entry.group && <small>{entry.members.filter(project => project.progress != null).length}/{entry.members.length} recorded</small>}</td><td>{entry.status ? <Badge value={entry.status} /> : <span className="mr-unrecorded">Unrecorded</span>}</td>
  </tr>;
  return <section className="mr-overview-table" aria-label="Project overview">
    <div className="mr-table-tools"><span>{items.length} projects · {rows.length} {grouped ? "overview rows" : "individual rows"}</span><label>Display<select aria-label="Overview grouping" value={grouped ? "grouped" : "individual"} onChange={event => setGrouped(event.target.value === "grouped")}><option value="grouped">Combine project groups</option><option value="individual">Individual projects</option></select></label></div>
    {items.length ? <div className="mr-table-scroll"><table aria-label="Project overview table"><thead><tr>{["No.", "Project name", "Category", "Department", "Summary", "Progress", "Status"].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead><tbody>{rows.flatMap((entry, index) => [row(entry, String(index + 1)), ...(entry.group && expanded.has(entry.group.id) ? portfolioRows(entry.members, [], false).map((member, childIndex) => row(member, `${index + 1}.${childIndex + 1}`, true)) : [])])}</tbody></table></div> : <Empty title="No projects match this overview" />}
    <p className="mr-table-note">Select a project name for its details and links. Group progress is the equal-weight average of recorded progress for the projects shown; mixed statuses are labeled Mixed.</p>
  </section>;
}

function PortfolioDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const headingId = useId();
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? []);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", key, true);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", key, true); queueMicrotask(() => { if (previous?.isConnected) previous.focus(); }); };
  }, []);
  return createPortal(<div className="mr-portfolio-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="mr-portfolio-dialog" data-review-dialog ref={dialog} role="dialog" aria-modal="true" aria-labelledby={headingId}><header><div><span className="mr-kicker">DTU · PROJECT PORTFOLIO</span><h2 id={headingId}>{title}</h2></div><button ref={closeButton} className="icon-button" onClick={onClose} aria-label="Close project dialog">×</button></header><div className="mr-dialog-body">{children}</div></section></div>, document.body);
}

function ProjectLinks({ projects }: { projects: Item[] }) {
  const links = projects.flatMap(project => (project.links ?? []).flatMap(link => {
    try { if (!["http:", "https:"].includes(new URL(link.url).protocol)) return []; } catch { return []; }
    return [{ ...link, projectName: project.name }];
  }));
  return <section className="mr-detail-section"><h3>Project links</h3>{links.length ? <div className="mr-detail-links">{links.map((link, index) => <a key={`${link.id}-${index}`} href={link.url} target="_blank" rel="noopener noreferrer"><strong>{link.title} ↗</strong>{projects.length > 1 && <span>{link.projectName}</span>}<small>{link.url}</small></a>)}</div> : <p className="muted">No system link has been added yet. You can add links in the full project record.</p>}</section>;
}

export function ProjectDetailsDialog({ selection, portfolio, groups, onSelect, onClose }: { selection: PortfolioSelection; portfolio: Item[]; groups: ProjectGroup[]; onSelect: (selection: PortfolioSelection) => void; onClose: () => void }) {
  const project = selection.kind === "project" ? portfolio.find(item => item.id === selection.id) : undefined;
  const group = selection.kind === "group" ? groups.find(item => item.id === selection.id) : undefined;
  const members = group ? portfolio.filter(item => item.group_id === group.id) : [];
  const parent = project?.group_id ? groups.find(item => item.id === project.group_id) : undefined;
  const aggregate = group ? portfolioRows(members, groups, true)[0] : undefined;
  return <PortfolioDialog title={project?.name || group?.name || "Project details"} onClose={onClose}>
    {!project && !group ? <Empty title="This project or group is no longer available" /> : project ? <>
      <div className="mr-detail-position"><span>Live project details</span><Badge value={project.status} />{parent && <button onClick={() => onSelect({ kind: "group", id: parent.id })}>← {parent.name}</button>}</div>
      <dl className="mr-detail-facts"><div><dt>Project no.</dt><dd>{project.project_no}</dd></div><div><dt>Category</dt><dd>{project.reporting_category}</dd></div><div><dt>Department</dt><dd>{project.department_name}</dd></div><div><dt>Owner</dt><dd>{project.owner_name || "Unassigned"}</dd></div><div><dt>Start</dt><dd>{formatDate(project.start_date)}</dd></div><div><dt>Target</dt><dd>{formatDate(project.due_date)}</dd></div></dl>
      <section className="mr-detail-section"><h3>Delivery progress</h3><ProgressValue value={project.progress} /></section>
      <section className="mr-detail-section"><h3>Project summary</h3><p>{project.description || "No project description has been added."}</p></section>
      <section className="mr-detail-section"><h3>Latest progress</h3><p>{project.current_update || "No progress update has been published yet."}</p></section>
      <section className="mr-detail-section"><h3>Next action</h3><p>{project.next_action || "No next action recorded."}</p></section>
      <ProjectLinks projects={[project]} /><Link className="button button-secondary" to={`/projects/${project.id}`}>Open full project record ↗</Link>
    </> : <>
      <div className="mr-detail-position"><span>Project group · {members.length} projects</span>{aggregate?.status && <Badge value={aggregate.status} />}</div>
      <p className="mr-group-description">{group!.summary || "Related projects presented together."}</p>
      <section className="mr-detail-section"><h3>Combined progress</h3><ProgressValue value={aggregate?.progress ?? null} /><p className="mr-table-note">Equal-weight average of current recorded progress across all child projects. Each project keeps its own status and history.</p></section>
      <section className="mr-detail-section"><h3>Projects inside {group!.name}</h3><div className="mr-group-children">{members.map(item => <button key={item.id} onClick={() => onSelect({ kind: "project", id: item.id })}><span><strong>{item.name}</strong><small>{item.department_name} · {item.reporting_category}</small></span><ProgressValue value={item.progress} /><Badge value={item.status} /><span>↗</span></button>)}</div></section>
      <ProjectLinks projects={members} />
    </>}
  </PortfolioDialog>;
}

export function ProjectGroupManager({ portfolio, groups, onSaved, onClose }: { portfolio: Item[]; groups: ProjectGroup[]; onSaved: () => Promise<void>; onClose: () => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const reset = () => { setEditing(null); setName(""); setSummary(""); setSelected(new Set()); setSearch(""); };
  const edit = (group: ProjectGroup) => { setEditing(group.id); setName(group.name); setSummary(group.summary); setSelected(new Set(group.project_ids)); setSearch(""); setError(""); setNotice(""); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await api(`/api/staff/monthly-review/groups${editing ? `/${editing}` : ""}`, json(editing ? "PATCH" : "POST", { name: name.trim(), summary: summary.trim(), projectIds: [...selected] }));
      await onSaved(); reset(); setNotice("Project group saved.");
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const ungroup = async (group: ProjectGroup) => {
    setBusy(true); setError(""); setNotice("");
    try { await api(`/api/staff/monthly-review/groups/${group.id}`, json("DELETE")); await onSaved(); if (editing === group.id) reset(); setNotice("Group removed. All child projects and their history are preserved."); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return <PortfolioDialog title="Group related projects" onClose={onClose}>
    <p className="mr-group-help">Present related work under one name, for example Safety Digital with Hayari Hattoo and Red Tag. Projects keep their own links, progress, and history.</p>
    <ErrorNotice message={error} />{notice && <p role="status" className="mr-group-notice">{notice}</p>}
    {groups.length > 0 && <div className="mr-existing-groups">{groups.map(group => <article key={group.id}><div><strong>{group.name}</strong><small>{group.project_ids.length} projects</small></div><button disabled={busy} onClick={() => edit(group)} aria-label={`Edit group ${group.name}`}>Edit</button><button disabled={busy} onClick={() => void ungroup(group)} aria-label={`Ungroup ${group.name}`}>Ungroup</button></article>)}</div>}
    <form className="form-stack" onSubmit={event => void save(event)}><h3>{editing ? "Edit group" : "Create a group"}</h3>
      <label>Group name<input required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Safety Digital" disabled={busy} /></label>
      <label>Group summary<textarea maxLength={3000} value={summary} onChange={event => setSummary(event.target.value)} placeholder="What these projects deliver together" disabled={busy} /></label>
      <label>Find projects to combine<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search project name or department…" /></label>
      <div className="mr-group-selection-heading"><strong>Choose projects</strong><span>{selected.size} selected</span></div>
      <div className="mr-group-project-picker">{portfolio.filter(item => `${item.name} ${item.project_no} ${item.department_name}`.toLowerCase().includes(search.toLowerCase())).map(item => {
        const assignedElsewhere = item.group_id != null && item.group_id !== editing;
        const parentName = assignedElsewhere ? groups.find(group => group.id === item.group_id)?.name : null;
        return <label key={item.id} className={assignedElsewhere ? "is-unavailable" : ""}><input type="checkbox" aria-label={`Include ${item.name}`} checked={selected.has(item.id)} disabled={busy || assignedElsewhere} onChange={event => setSelected(previous => { const next = new Set(previous); event.target.checked ? next.add(item.id) : next.delete(item.id); return next; })} /><span><strong>{item.name}</strong><small>{item.project_no} · {item.department_name}{parentName ? ` · Already in ${parentName}` : ""}</small></span></label>;
      })}</div>
      <p className="mr-table-note">A project can belong to one group. Ungrouping returns its children to the individual overview.</p>
      <div className="mr-group-form-actions"><button className="button button-primary" disabled={busy || !name.trim() || !selected.size}>{busy ? "Saving…" : editing ? "Save group" : "Create group"}</button>{editing && <button type="button" className="button button-secondary" disabled={busy} onClick={reset}>Create another group</button>}</div>
    </form>
  </PortfolioDialog>;
}
