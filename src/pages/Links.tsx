import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ArrowIcon, LinkIcon, ProjectIcon, SearchIcon } from "../components/Icons";
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
  latest_image_id: number | null;
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

function compareProjectNumbers(left: LinkProject, right: LinkProject) {
  return left.project_no.localeCompare(right.project_no, undefined, { numeric: true, sensitivity: "base" });
}

export function LinksPage() {
  const [data, setData] = useState<LinksResponse | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [sort, setSort] = useState("project_no_asc");

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
      if (sort === "project_no_desc") return compareProjectNumbers(right, left);
      if (sort === "name_asc") return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      if (sort === "links_desc") return right.links.length - left.links.length || compareProjectNumbers(left, right);
      return compareProjectNumbers(left, right);
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
        <label>Project<select value={projectId} onChange={event => setProjectId(event.target.value)}><option value="all">All projects</option>{data.projects.map(project => <option key={project.id} value={project.id}>{project.project_no} - {project.name}</option>)}</select></label>
        <label>Sort<select value={sort} onChange={event => setSort(event.target.value)}><option value="project_no_asc">Project number</option><option value="project_no_desc">Project number descending</option><option value="name_asc">Project name A-Z</option><option value="links_desc">Most links</option></select></label>
        <span className="links-result-count"><strong>{visibleLinkCount}</strong> of {data.linkCount} links - <strong>{visibleProjects.length}</strong> projects</span>
      </section>

      {visibleProjects.length ? <div className="links-project-list">
        {visibleProjects.map(project => <section className="links-project-group" key={project.id}>
          <header className="links-project-summary">
            <Link className={`links-project-image${project.latest_image_id ? " has-image" : ""}`} to={`/projects/${project.id}`} aria-label={`Open ${project.name}`}>
              {project.latest_image_id
                ? <img src={`/api/staff/projects/progress-images/${project.latest_image_id}`} alt={`Latest progress for ${project.name}`} />
                : <span><ProjectIcon /><small>No progress image</small></span>}
            </Link>
            <div className="links-project-copy">
              <div><span className="mono">{project.project_no}</span><Badge value={project.status} /></div>
              <Link to={`/projects/${project.id}`}><h2>{project.name}</h2></Link>
              <small>{project.department_name}</small>
              <footer><span>{project.links.length} {project.links.length === 1 ? "system link" : "system links"}</span><Link to={`/projects/${project.id}`}>Open project <ArrowIcon /></Link></footer>
            </div>
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
