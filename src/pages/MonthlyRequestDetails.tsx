import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDate } from "../api";
import { Badge, ErrorNotice } from "../components/UI";
import { PortfolioDialog, ProjectLinks, ProjectPhotos } from "./MonthlyReviewPortfolio";
import type { Item } from "./MonthlyReview";

type RequestData = {
  item: Item & { current_problem?: string; requester_email?: string; requester_phone?: string; triage_notes?: string; urgency?: string; expected_users?: number };
  project?: (Item & { latest_image_id?: number }) | null;
  attachments?: { id: number; original_name: string; mime_type: string }[];
};

export function MonthlyRequestDetails({ id, portfolio, onProject, onClose }: { id: number; portfolio: Item[]; onProject: (id: number) => void; onClose: () => void }) {
  const [data, setData] = useState<RequestData | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError("");
    void api<RequestData>(`/api/staff/requests/${id}`).then(next => { if (active) setData(next); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [id, retry]);
  const item = data?.item;
  const project = data?.project ? { ...portfolio.find(item => item.id === data.project?.id), ...data.project } : null;
  const progress = project && ["completed", "complete_monitoring"].includes(project.status || "") ? 100 : project?.progress;
  return <PortfolioDialog title={item?.title || "Request details"} onClose={onClose}>
    {error ? <><ErrorNotice message={error} /><button className="button button-secondary" onClick={() => setRetry(value => value + 1)}>Retry</button></> : !item ? <p role="status">Loading request…</p> : <>
      <div className="mr-detail-position"><span>{item.request_no}</span><Badge value={item.status} />{item.urgency && <Badge value={item.urgency} kind="priority" />}</div>
      <dl className="mr-detail-facts"><div><dt>Category</dt><dd>{item.reporting_category || "Other"}</dd></div><div><dt>Department</dt><dd>{item.department_name}</dd></div><div><dt>Requester</dt><dd>{item.requester_name}</dd></div><div><dt>Submitted</dt><dd>{formatDate(item.created_at)}</dd></div><div><dt>Target</dt><dd>{formatDate(item.target_date)}</dd></div><div><dt>Expected users</dt><dd>{item.expected_users || "—"}</dd></div></dl>
      <section className="mr-detail-section"><h3>Current problem</h3><p>{item.current_problem || "No problem description added."}</p></section>
      <section className="mr-detail-section"><h3>Desired outcome</h3><p>{item.desired_outcome || "No outcome added."}</p></section>
      {item.triage_notes && <section className="mr-detail-section"><h3>DTU notes</h3><p>{item.triage_notes}</p></section>}
      {!!data?.attachments?.length && <section className="mr-detail-section"><h3>Supporting files</h3><div className="mr-detail-links">{data.attachments.map(file => <a href={`/api/staff/attachments/${file.id}`} key={file.id} target="_blank" rel="noreferrer">{file.mime_type.startsWith("image/") && <img className="mr-request-attachment" src={`/api/staff/attachments/${file.id}`} alt={file.original_name} />}<strong>{file.original_name} ↗</strong></a>)}</div></section>}
      {project && <><section className="mr-detail-section"><h3>Approved project</h3><div className="mr-request-project"><div><strong>{project.name}</strong><small>{project.project_no} · {project.owner_name || "Unassigned"}</small></div><Badge value={project.status} /><strong>{progress == null ? "Unrecorded" : `${progress}%`}</strong><button className="button button-secondary" onClick={() => onProject(project.id)}>View project</button></div></section><ProjectPhotos projects={[project]} /><ProjectLinks projects={[project]} /></>}
      <Link className="button button-secondary" to={`/requests/${id}`}>Open full request ↗</Link>
    </>}
  </PortfolioDialog>;
}
