import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDate } from "../api";
import { Badge } from "../components/UI";
import { useLiveRefresh } from "../live";
import { isSystemAsset, type FactoryAsset } from "./factoryLayout";

export const factoryProjectPins = [
  { key: "checksheet-line-1", projectNo: "PRJ-0014", label: "Line 1 Checksheet", symbol: "1", assetId: "line-1-panel", line: 1, height: 5.8 },
  { key: "checksheet-line-2", projectNo: "PRJ-0015", label: "Line 2 Checksheet", symbol: "2", assetId: "line-2-panel", line: 2, height: 6.1 },
  { key: "smart-attendance", projectNo: "PRJ-0013", label: "Smart Attendance", symbol: "A", assetId: "attendance", line: null, height: 4.2 },
] as const;
export type FactoryProjectPin = typeof factoryProjectPins[number];
export type FactoryProject = {
  id: number; project_no: string; name: string; description?: string | null; status: string;
  progress?: number | null; department_name?: string | null; owner_name?: string | null;
  latest_image_id?: number | null; updated_at?: string | null; group_name?: string | null;
};

export function pinForFactoryAsset(asset?: FactoryAsset) {
  if (!asset) return undefined;
  if (asset.id === "attendance") return factoryProjectPins[2];
  return isSystemAsset(asset) ? factoryProjectPins.find(pin => pin.line !== null && pin.line === asset.line) : undefined;
}

export function projectForFactoryPin(projects: FactoryProject[] | null, pin: FactoryProjectPin) {
  return projects?.find(project => project.project_no.toUpperCase() === pin.projectNo);
}

export function factoryProjectProgress(project: FactoryProject): number | null {
  if (["completed", "complete_monitoring"].includes(project.status)) return 100;
  if (project.progress == null || !Number.isFinite(Number(project.progress))) return null;
  return Math.max(0, Math.min(100, Number(project.progress)));
}

export function useFactoryProjects() {
  const [projects, setProjects] = useState<FactoryProject[] | null>(null);
  const [error, setError] = useState("");
  const active = useRef(false), request = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++request.current;
    try {
      const next = await api<FactoryProject[]>("/api/staff/projects", { signal: AbortSignal.timeout(8000) });
      if (!Array.isArray(next)) throw new Error("Project list is unavailable.");
      if (active.current && sequence === request.current) { setProjects(next); setError(""); }
    } catch (cause) {
      if (active.current && sequence === request.current) setError(cause instanceof Error ? cause.message : "Could not load projects.");
    }
  }, []);
  useEffect(() => { active.current = true; void refresh(); return () => { active.current = false; request.current++; }; }, [refresh]);
  useLiveRefresh(refresh);
  return { projects, error, refresh };
}

export function FactoryProjectCard({ pin, projects, error, onRetry, onClose }: {
  pin: FactoryProjectPin; projects: FactoryProject[] | null; error: string; onRetry: () => void; onClose: () => void;
}) {
  const project = projectForFactoryPin(projects, pin);
  const close = useRef<HTMLButtonElement>(null);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => { setImageFailed(false); }, [project?.latest_image_id]);
  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [pin.key, onClose]);
  const progress = project ? factoryProjectProgress(project) : null;
  return <section className="factory-project-popover" role="dialog" aria-label={`Project details · ${pin.label}`}>
    <header><div><small>LINKED PROJECT</small><strong>{pin.projectNo}</strong></div><button type="button" ref={close} aria-label="Close project details" onClick={onClose}>×</button></header>
    {project ? <>
      {project.latest_image_id && !imageFailed ? <img className="factory-project-photo" src={`/api/staff/projects/progress-images/${project.latest_image_id}`} alt={`Latest progress for ${project.name}`} onError={() => setImageFailed(true)} /> : <div className="factory-project-no-photo">{pin.symbol}<span>{pin.label}</span></div>}
      <div className="factory-project-card-body">
        {error && <p className="factory-project-warning" role="status">Refresh unavailable · showing the last loaded record. <button type="button" onClick={onRetry}>Retry</button></p>}
        <Badge value={project.status} /><h2>{project.name}</h2>
        {project.group_name && <small className="factory-project-group">{project.group_name}</small>}
        {project.description && <p className="factory-project-description">{project.description}</p>}
        <div className="factory-project-progress"><span>Project progress</span><strong>{progress == null ? "Not recorded" : `${progress}%`}</strong></div>
        {progress != null && <progress max={100} value={progress} aria-label={`${project.name} project progress`} />}
        <dl><div><dt>Department</dt><dd>{project.department_name || "—"}</dd></div><div><dt>Owner</dt><dd>{project.owner_name || "—"}</dd></div></dl>
        {project.updated_at && <small className="factory-project-updated">Updated {formatDate(project.updated_at)}</small>}
        <Link className="factory-project-open" to={`/projects/${project.id}`}>Open project <span aria-hidden="true">↗</span></Link>
      </div>
    </> : <div className="factory-project-card-body"><h2>{pin.label}</h2>
      {error ? <><p role="alert">Could not load this project: {error}</p><button type="button" className="factory-project-retry" onClick={onRetry}>Retry</button></> : projects === null ? <p role="status">Loading the saved project…</p> : <><p>{pin.projectNo} was not found in this database. This pin uses the saved project number, not the project name.</p><Link to="/projects">Open project list ↗</Link></>}
    </div>}
  </section>;
}
