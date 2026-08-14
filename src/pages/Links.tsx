import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ArrowIcon, LinkIcon, SearchIcon } from "../components/Icons";
import { Badge, Empty, ErrorNotice, Loading, PageHeader } from "../components/UI";

type SystemLink = {
  id: number;
  title: string;
  url: string;
  sort_order: number;
};

type LinkProject = {
  id: number;
  project_no: string;
  name: string;
  department_name: string;
  status: string;
  updated_at: string;
  links: SystemLink[];
};

type LinksResponse = {
  projects: LinkProject[];
  linkCount: number;
};

function displayUrl(value: string) {
  try {
    const parsed = new URL(value);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return value;
  }
}

export function LinksPage() {
  const [data, setData] = useState<LinksResponse | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [sort, setSort] = useState("project_asc");

  useEffect(() => {
    void api<LinksResponse>("/api/staff/project-links").then(setData).catch(err => setError((err as Error).message));
  }, []);

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    const projects = (data?.projects ?? []).flatMap(project => {
      if (projectId !== "all" && String(project.id) !== projectId) return [];
      const projectMatches = `${project.project_no} ${project.name} ${project.department_name}`.toLowerCase().includes(query);
      const links = query && !projectMatches
        ? project.links.filter(link => `${link.title} ${link.url}`.toLowerCase().includes(query))
        : project.links;
      return links.length ? [{ ...project, links }] : [];
    });

    return projects.sort((left, right) => {
      if (sort === "project_desc") return right.name.localeCompare(left.name, undefined, { sensitivity: "base" });
      if (sort === "links_desc") return right.links.length - left.links.length || left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    });
  }, [data, projectId, search, sort]);

  if (!data && !error) return <Loading />;

  const visibleLinkCount = visibleProjects.reduce((total, project) => total + project.links.length, 0);

  return <>
    <PageHeader
      eyebrow="Shared directory"
      title="System Links"
      description="Open every system link saved in the project portfolio. Links are grouped by project and visible to all signed-in staff."
    />
    <ErrorNotice message={error} />
    {data && <>
      <section className="links-toolbar" aria-label="Filter and sort system links">
        <div className="search-box"><SearchIcon /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search projects or links" aria-label="Search projects or links" /></div>
        <label>Project<select value={projectId} onChange={event => setProjectId(event.target.value)}><option value="all">All projects</option>{data.projects.map(project => <option key={project.id} value={project.id}>{project.project_no} · {project.name}</option>)}</select></label>
        <label>Sort<select value={sort} onChange={event => setSort(event.target.value)}><option value="project_asc">Project A–Z</option><option value="project_desc">Project Z–A</option><option value="links_desc">Most links</option></select></label>
        <span className="links-result-count"><strong>{visibleLinkCount}</strong> of {data.linkCount} links · <strong>{visibleProjects.length}</strong> projects</span>
      </section>

      {visibleProjects.length ? <div className="links-project-list">
        {visibleProjects.map(project => <section className="links-project-group" key={project.id}>
          <header>
            <div><span className="mono">{project.project_no}</span><Link to={`/projects/${project.id}`}><h2>{project.name}</h2></Link><small>{project.department_name}</small></div>
            <div><Badge value={project.status} /><span>{project.links.length} {project.links.length === 1 ? "link" : "links"}</span></div>
          </header>
          <div className="links-directory-grid">
            {project.links.map(link => <a className="links-directory-card" href={link.url} target="_blank" rel="noreferrer" key={link.id}>
              <span className="links-directory-icon"><LinkIcon /></span>
              <span className="links-directory-copy"><strong>{link.title}</strong><small>{displayUrl(link.url)}</small></span>
              <span className="links-directory-open" aria-hidden="true"><ArrowIcon /></span>
            </a>)}
          </div>
        </section>)}
      </div> : <section className="panel"><Empty title="No links found" body={data.linkCount ? "Try another project or search term." : "System links added to projects will appear here."} /></section>}
    </>}
  </>;
}
