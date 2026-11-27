import { useSyncExternalStore } from "react";
import { api, json } from "./api";
import { refreshAllLive } from "./live";
import type { GroupableProject, GroupDefinition, GroupLink } from "./projectGroups";

/**
 * Optimistic project-group editing shared by every page.
 *
 * A save or ungroup is applied to the screen at once as an "override". The override stays until the
 * server confirms and every mounted page has reloaded, so the view never flickers back to stale data.
 * A failed request drops the override (the screen rolls back) and leaves a toast that can reopen the draft.
 */
export type GroupDraft = { id?: number; name: string; summary: string; links: GroupLink[]; project_ids: number[] };
type Override = { draft: GroupDraft | null; state: "saving" | "confirming" };
type Toast = { id: number; tone: "progress" | "success" | "error"; message: string; retry?: { groupId: number | null; draft: GroupDraft } };
type Editor = { groupId: number | null; draft?: GroupDraft; closing?: boolean };
type State = { overrides: ReadonlyMap<number, Override>; editor: Editor | null; toast: Toast | null };

let state: State = { overrides: new Map(), editor: null, toast: null };
const listeners = new Set<() => void>();
let nextTemporaryId = -1;
let nextToastId = 1;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function setOverride(id: number, override: Override | undefined) {
  const overrides = new Map(state.overrides);
  if (override) overrides.set(id, override); else overrides.delete(id);
  setState({ overrides });
}
function showToast(toast: Omit<Toast, "id">, hideAfter?: number) {
  clearTimeout(toastTimer);
  const id = nextToastId++;
  setState({ toast: { ...toast, id } });
  if (hideAfter) toastTimer = setTimeout(() => { if (state.toast?.id === id) setState({ toast: null }); }, hideAfter);
}

export function useGroupEditing() { return useSyncExternalStore(subscribe, () => state, () => state); }
/** Clear editor, toast, and pending edits (used between tests). */
export function resetGroupEditing() { clearTimeout(toastTimer); setState({ overrides: new Map(), editor: null, toast: null }); }
export function dismissGroupToast() { clearTimeout(toastTimer); setState({ toast: null }); }
export function openGroupEditor(groupId: number | null = null, draft?: GroupDraft) {
  setState({ editor: { groupId, draft } });
}
export function reportGroupError(message: string) { setState({ editor: null }); showToast({ tone: "error", message }); }
const closeDuration = 240;
/** Let the dialog ease out before it unmounts (instantly when the viewer prefers reduced motion). */
export function closeGroupEditor() {
  const editor = state.editor;
  if (!editor || editor.closing) return;
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)")?.matches;
  if (reduced) { setState({ editor: null }); return; }
  setState({ editor: { ...editor, closing: true } });
  setTimeout(() => { if (state.editor === editor || state.editor?.closing) setState({ editor: null }); }, closeDuration);
}

const filledLinks = (links: GroupLink[]) => links.filter(link => link.title.trim() && link.url.trim());

async function commit(id: number, draft: GroupDraft | null, request: () => Promise<unknown>, labels: { progress: string; success: string; failure: string }, retry?: Toast["retry"]) {
  setOverride(id, { draft, state: "saving" });
  showToast({ tone: "progress", message: labels.progress });
  try {
    await request();
    setOverride(id, { draft, state: "confirming" });
    await refreshAllLive();
    setOverride(id, undefined);
    showToast({ tone: "success", message: labels.success }, 2600);
    return true;
  } catch (error) {
    setOverride(id, undefined);
    showToast({ tone: "error", message: `${labels.failure} ${(error as Error).message}`, retry });
    return false;
  }
}

/** Create or update a group; the change appears immediately and rolls back if the server refuses it. */
export function saveGroup(draft: GroupDraft) {
  const existing = draft.id;
  const id = existing ?? nextTemporaryId--;
  const preview = { ...draft, id, links: filledLinks(draft.links) };
  return commit(id, preview,
    () => api(`/api/staff/monthly-review/groups${existing ? `/${existing}` : ""}`, json(existing ? "PATCH" : "POST", { name: draft.name, summary: draft.summary, projectIds: draft.project_ids, links: draft.links })),
    { progress: `Saving ${draft.name}…`, success: `${draft.name} saved`, failure: `${draft.name} was not saved.` },
    { groupId: existing ?? null, draft });
}

/** Remove a group (and its group links). Child projects return to the individual list immediately. */
export function ungroupGroup(group: { id: number; name: string }) {
  return commit(group.id, null,
    () => api(`/api/staff/monthly-review/groups/${group.id}`, json("DELETE")),
    { progress: `Ungrouping ${group.name}…`, success: `${group.name} ungrouped. Its projects and their history are unchanged.`, failure: `${group.name} was not ungrouped.` });
}

/** Apply pending group edits to project rows, moving projects in or out of groups as the drafts say. */
export function applyGroupOverrides<T extends GroupableProject>(projects: T[], overrides = state.overrides): T[] {
  if (!overrides.size) return projects;
  const owner = new Map<number, GroupDraft & { id: number }>();
  overrides.forEach(({ draft }, id) => draft?.project_ids.forEach(projectId => owner.set(projectId, { ...draft, id })));
  return projects.map(project => {
    const draft = owner.get(project.id);
    if (draft) return { ...project, group_id: draft.id, group_name: draft.name, group_summary: draft.summary, group_links: draft.links, group_total: draft.project_ids.length };
    if (project.group_id != null && overrides.has(project.group_id)) return { ...project, group_id: null, group_name: null, group_summary: null, group_links: [], group_total: 0 };
    return project;
  });
}

/** Apply pending group edits to explicit group definitions (used by pages that load groups separately). */
export function applyDefinitionOverrides<D extends GroupDefinition>(definitions: D[] | undefined, overrides = state.overrides): D[] | undefined {
  if (!definitions || !overrides.size) return definitions;
  const next = definitions.flatMap(definition => {
    const override = overrides.get(definition.id);
    if (!override) return [definition];
    return override.draft ? [{ ...definition, ...override.draft, id: definition.id }] : [];
  });
  overrides.forEach(({ draft }, id) => { if (draft && !definitions.some(definition => definition.id === id)) next.push({ ...draft, id } as unknown as D); });
  return next;
}

export function groupSaveState(id: number | undefined, overrides = state.overrides) {
  return id === undefined ? undefined : overrides.get(id)?.state;
}
