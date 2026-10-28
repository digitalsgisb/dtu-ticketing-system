import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useLiveRefresh } from "../live";
import { SearchIcon } from "./Icons";
import { Badge } from "./UI";
import "./dashboard-search.css";

export function searchDashboardProjects(projects: any[], query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return projects.filter(project => {
    const text = [project.name, project.project_no, project.department_name, project.owner_name, project.group_name].filter(Boolean).join(" ").toLowerCase();
    return words.every(word => text.includes(word));
  });
}

export function DashboardProjectSearch() {
  const [projects, setProjects] = useState<any[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const load = () => api<any[]>("/api/staff/projects").then(next => { setProjects(next); setError(""); }).catch(err => setError(err.message));
  useEffect(() => { void load(); }, []);
  useLiveRefresh(load);
  const results = searchDashboardProjects(projects ?? [], query);
  const destination = `/projects?search=${encodeURIComponent(query.trim())}`;
  const submit = (event: FormEvent) => { event.preventDefault(); if (query.trim()) navigate(destination); };
  return <section className="dashboard-project-search" aria-label="Find a project">
    <form role="search" onSubmit={submit}><label className="dps-input"><SearchIcon /><input aria-label="Search dashboard projects" type="search" placeholder="Search projects by name, ID, department, owner, or group…" value={query} onChange={event => setQuery(event.target.value)} aria-controls="dashboard-project-results" /></label></form>
    <div id="dashboard-project-results" aria-live="polite">
      {error ? <p role="alert">Projects could not be loaded. <button className="text-link" onClick={() => void load()}>Try again</button></p> : query.trim() && (projects === null ? <p>Loading projects…</p> : <>
        <div className="dps-count">{results.length} {results.length === 1 ? "project" : "projects"} found{results.length > 6 && " · Showing the first 6"}</div>
        {results.length ? <ul className="dps-results">{results.slice(0, 6).map(project => <li key={project.id}><Link to={`/projects/${project.id}`}><span><small>{project.project_no} · {project.department_name}</small><strong>{project.name}</strong>{project.group_name && <em>{project.group_name}</em>}</span><span><Badge value={project.status} /><b>{project.progress ?? 0}% <i>↗</i></b></span></Link></li>)}</ul> : <p>No matching projects. Try another name, ID, or department.</p>}
        {results.length > 0 && <Link to={destination} className="text-link">View all matching projects →</Link>}
      </>)}
    </div>
  </section>;
}
