import { type ReactNode } from "react";
import "./request-dashboard.css";

export const requestStages = [
  { status: "submitted", name: "Pending review", description: "New requests awaiting a first review", tone: "pending" },
  { status: "triage", name: "Under review", description: "DTU is assessing scope and feasibility", tone: "review" },
  { status: "needs_information", name: "Needs information", description: "Waiting for details from the requester", tone: "information" },
  { status: "approved", name: "Approved", description: "Accepted requests and their delivery progress", tone: "approved" },
  { status: "rejected", name: "Rejected", description: "Requests closed with a rejection decision", tone: "rejected" }
] as const;
export type RequestRecord = { id: number; status: string | null; created_project_id?: number | null; project_status?: string | null; project_progress?: number | null };
export function requestMetrics(items: RequestRecord[]) {
  const approved = items.filter(item => item.status === "approved");
  const delivered = approved.filter(item => item.created_project_id && ["completed", "complete_monitoring"].includes(item.project_status || ""));
  const pending = items.filter(item => ["submitted", "triage", "needs_information"].includes(item.status || ""));
  return { total: items.length, approved: approved.length, delivered: delivered.length, pending: pending.length,
    rejected: items.filter(item => item.status === "rejected").length,
    acceptance: items.length ? Math.round(approved.length / items.length * 100) : null,
    delivery: approved.length ? Math.round(delivered.length / approved.length * 100) : null };
}
export function RequestDashboard({ items, compact = false }: { items: RequestRecord[]; compact?: boolean }) {
  const metrics = requestMetrics(items);
  const cards = [
    [metrics.total, "Total requests", "All stages in this view"],
    [metrics.acceptance == null ? "—" : `${metrics.acceptance}%`, "Acceptance rate", `${metrics.approved} approved / ${metrics.total} total requests`],
    [metrics.delivery == null ? "—" : `${metrics.delivery}%`, "Delivery rate", `${metrics.delivered} delivered / ${metrics.approved} approved requests`],
    [metrics.pending, "Pending requests", "New, under review, or awaiting information"],
    [metrics.approved, "Approved requests", "Accepted into the project portfolio"],
    [metrics.rejected, "Rejected requests", "Closed without approval"]
  ];
  return <section className={`request-dashboard${compact ? " is-compact" : ""}`} aria-label="Request performance dashboard">
    <header><div><span className="eyebrow">Demand to delivery</span><h2>Request performance</h2></div><span className="rd-scope">Live · all request stages in this view</span></header>
    <div className="rd-metrics">{cards.map(([value, label, note]) => <article key={label}><strong>{value}</strong><h3>{label}</h3><small>{note}</small></article>)}</div>
    <div className="rd-distribution" aria-label="Requests by stage">{requestStages.map(stage => {
      const count = items.filter(item => item.status === stage.status).length;
      return <div className={`rd-stage rd-${stage.tone}`} key={stage.status}><div><span>{stage.name}</span><strong>{count}</strong></div><div className="rd-track"><i style={{ width: `${items.length ? count / items.length * 100 : 0}%` }} /></div></div>;
    })}</div>
    <p className="rd-note">Acceptance = approved ÷ all requests. Delivery = completed or monitoring projects ÷ approved requests. Missing linked projects remain undelivered; cancelled projects are excluded from delivered totals. These are live totals, independent of the reporting month.</p>
  </section>;
}
export function RequestStageFilter({ items, value, onChange }: { items: RequestRecord[]; value: string; onChange: (stage: string) => void }) {
  return <nav className="request-stage-filter" aria-label="Filter request stages"><button aria-pressed={!value} onClick={() => onChange("")}><strong>{items.length}</strong><span>All requests</span></button>{requestStages.map(stage => <button className={`rd-${stage.tone}`} key={stage.status} aria-pressed={value === stage.status} onClick={() => onChange(stage.status)}><strong>{items.filter(item => item.status === stage.status).length}</strong><span>{stage.name}</span></button>)}</nav>;
}
export function RequestStageSections<T extends RequestRecord>({ items, renderItem, selected = "", gridClassName = "request-list" }: { items: T[]; renderItem: (item: T) => ReactNode; selected?: string; gridClassName?: string }) {
  return <div className="request-stage-sections">{requestStages.filter(stage => !selected || stage.status === selected).map(stage => {
    const members = items.filter(item => item.status === stage.status);
    return <section className={`request-stage-section rd-${stage.tone}`} key={stage.status} aria-label={`${stage.name} requests`}><header><div><span className="rd-stage-dot" /><h2>{stage.name}</h2><strong>{members.length}</strong></div><p>{stage.description}</p></header>{members.length ? <div className={gridClassName}>{members.map(item => <div className="rd-item" key={item.id}>{renderItem(item)}</div>)}</div> : <p className="rd-empty">No requests in this stage.</p>}</section>;
  })}</div>;
}
