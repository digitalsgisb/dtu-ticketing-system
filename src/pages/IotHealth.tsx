import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, humanize } from "../api";
import "./iot-health.css";

type Telemetry = Record<string, string | number | boolean | null>;
type System = {
  id: string; name: string; site: string; status: string; lastMessageAt: string | null;
  telemetryAt: string | null; telemetry: Telemetry | null; dataWarning: boolean;
  connectionIssue: boolean; delayedAfterSeconds: number; silentAfterSeconds: number;
};
type Snapshot = { generatedAt: string; receiverRunning: boolean; configurationError: boolean; systems: System[] };
const labels: Record<string, string> = {
  healthy: "Healthy", delayed: "Delayed", silent: "Silent", unreachable: "Unreachable",
  waiting: "Waiting for messages", unconfigured: "Not configured", unknown: "Unknown"
};
function elapsed(value: string | null, now: number) {
  if (!value) return "No live message yet";
  const seconds = Math.max(0, Math.floor((now - Date.parse(value)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ago`;
}
function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return typeof value === "number" ? value.toLocaleString("en-MY", { maximumFractionDigits: 2 }) : String(value);
}

export function IotHealthPage() {
  return <><div className="page-header"><div><h1>IoT system health</h1><p>Live MQTT activity and production across your systems.</p></div><Link to="/wallboard?view=health">Open health wallboard ↗</Link></div><IotHealthPanel /></>;
}

export function IotHealthPanel({ wallboard = false, active = true, onInspect }: { wallboard?: boolean; active?: boolean; onInspect?: (open: boolean) => void }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!active && selected) {
      setSelected(null);
      onInspect?.(false);
    }
  }, [active, selected, onInspect]);
  const grid = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState({ columns: 4, rows: 2, compact: false });
  const [page, setPage] = useState(0);
  const pageSize = wallboard ? layout.columns * layout.rows : 8;
  const pageCount = Math.max(1, Math.ceil((data?.systems.length ?? 8) / pageSize));
  const visiblePage = page % pageCount;
  useEffect(() => {
    if (!wallboard || !grid.current) return;
    const measure = () => {
      const { width, height } = grid.current!.getBoundingClientRect();
      if (!width || !height) return;
      const columns = width >= 1200 ? 4 : width >= 640 ? 2 : 1;
      const rows = height >= 454 ? 2 : 1;
      const compact = height / rows < 260;
      setLayout(previous => previous.columns === columns && previous.rows === rows && previous.compact === compact ? previous : { columns, rows, compact });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid.current);
    return () => observer.disconnect();
  }, [wallboard]);
  useEffect(() => { setPage(0); }, [pageSize, active]);
  useEffect(() => {
    if (!wallboard || !active || selected || pageCount <= 1) return;
    const timer = setInterval(() => setPage(current => (current + 1) % pageCount), 15000);
    return () => clearInterval(timer);
  }, [wallboard, active, selected, pageCount]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const next = await api<Snapshot>("/api/wallboard/iot", { signal: AbortSignal.timeout(8000) });
        if (active) { setData(next); setFailed(false); }
      } catch { if (active) setFailed(true); }
      if (active) timer = setTimeout(() => void load(), 5000);
    };
    void load();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; clearTimeout(timer); clearInterval(clock); };
  }, []);
  const unavailable = failed || !data?.receiverRunning || (data ? now - Date.parse(data.generatedAt) > 15000 : false);
  const select = (id: string | null) => {
    if (id) trigger.current = document.activeElement as HTMLElement | null;
    setSelected(id); onInspect?.(id !== null);
    if (!id) trigger.current?.focus();
  };
  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") select(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected]);
  const statusFor = (system: System) => {
    if (unavailable || data?.configurationError) return "unknown";
    if (["healthy", "delayed", "silent"].includes(system.status) && system.lastMessageAt) {
      const age = (now - Date.parse(system.lastMessageAt)) / 1000;
      if (age >= system.silentAfterSeconds) return "silent";
      if (age >= system.delayedAfterSeconds) return "delayed";
    }
    return system.status;
  };
  const detail = data?.systems.find(system => system.id === selected);
  return <section className={`iot-health${wallboard ? " iot-health-wallboard" : ""}`}>
    <header className="iot-heading"><div><small>CONNECTED OPERATIONS · MQTT</small><h1>IoT System Health</h1><p>Port Klang · Sendayan · OEE Monitoring</p></div><div className="iot-summary"><strong>{data?.systems.filter(system => statusFor(system) === "healthy").length ?? 0}<span> / 8</span></strong><small>systems reporting normally</small></div></header>
    <div className="iot-health-notice" role="status">{failed || (data && unavailable) ? "Monitoring unavailable — last readings are stale. Check the AI PC and its network connection." : data?.configurationError ? "Monitoring configuration unavailable — check the receiver configuration file." : !data ? "Connecting to the monitoring receiver…" : "Connection health tracks MQTT activity. Machine operating state is shown separately."}</div>
    <div ref={grid} className={`iot-grid${layout.compact && wallboard ? " iot-grid-compact" : ""}`} style={wallboard ? { gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))` } : undefined}>{data?.systems.map((system, index) => {
      const status = statusFor(system);
      const telemetry = system.telemetry;
      const cardPage = Math.floor(index / pageSize);
      return <button type="button" className={`iot-card iot-status-${status}`} hidden={wallboard && cardPage !== visiblePage} key={`${system.id}-${wallboard ? visiblePage : "all"}`} onClick={() => select(system.id)}>
        <span className="iot-status-rail" aria-hidden="true"><i /></span>
        <div className="iot-card-top"><span>{system.site}</span><b><i />{labels[status]}</b></div>
        <h2>{system.name}</h2>
        <div className="iot-machine-state"><small>Machine state</small><strong>{display(telemetry?.current_mode)}</strong></div>
        <div className="iot-counts"><div><strong>{display(telemetry?.total_product_count ?? telemetry?.product_count)}</strong><small>Products</small></div><div><strong>{display(telemetry?.hourly_output)}</strong><small>This hour</small></div><div><strong>{display(telemetry?.total_reject)}</strong><small>Rejects</small></div></div>
        <div className="iot-job"><span>{display(telemetry?.model)}</span><small>Lot {display(telemetry?.lot_number)} · {display(telemetry?.shift)} shift</small></div>
        <footer><span>{elapsed(system.lastMessageAt, now)}</span><span>Details ↗</span></footer>
        {system.telemetry && (status !== "healthy" || system.dataWarning) && <p className="iot-card-warning">Last readings · {elapsed(system.telemetryAt, now)}{system.dataWarning ? " · Invalid telemetry received" : " · Stale"}</p>}
        {!system.telemetry && system.dataWarning && <p className="iot-card-warning">Messages received; expected a supported JSON payload.</p>}
      </button>;
    })}</div>
    {wallboard && <div className="iot-pagination" aria-label="System pages"><span>{pageCount > 1 ? `Systems ${visiblePage * pageSize + 1}–${Math.min((visiblePage + 1) * pageSize, data?.systems.length ?? 8)} of ${data?.systems.length ?? 8} · changes every 15s` : "All systems in view"}</span><div>{Array.from({ length: pageCount }, (_, index) => <button key={index} type="button" aria-label={`Show system page ${index + 1}`} aria-pressed={visiblePage === index} onClick={() => setPage(index)}><i /></button>)}</div></div>}
    {detail && <div className="iot-detail-backdrop" onClick={() => select(null)}><section className="iot-detail" role="dialog" aria-modal="true" aria-label={`${detail.name} telemetry`} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Tab") { event.preventDefault(); event.currentTarget.querySelector("button")?.focus(); } }}>
      <header><div><small>{detail.site} · {labels[statusFor(detail)]}</small><h2>{detail.name}</h2></div><button type="button" autoFocus aria-label="Close system details" onClick={() => select(null)}>×</button></header>
      <p>Last live message: {elapsed(detail.lastMessageAt, now)}{detail.lastMessageAt && ` · ${new Date(detail.lastMessageAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })} MYT`}</p>
      <p>Delayed after {detail.delayedAfterSeconds}s · Silent after {detail.silentAfterSeconds}s</p>
      {statusFor(detail) !== "healthy" && <p className="iot-card-warning">Readings may be stale. {detail.status === "unreachable" ? "The broker or network is unreachable; machine health is unknown." : "Check message freshness before using these values."}</p>}
      {detail.dataWarning && <p className="iot-card-warning">Latest message could not be used as telemetry. Displaying the last valid readings.</p>}
      {detail.connectionIssue && <p className="iot-card-warning">Check broker access, credentials, and topic subscription permissions on the receiver.</p>}
      {detail.telemetry ? <dl>{Object.entries(detail.telemetry).map(([key, value]) => <div key={key}><dt>{humanize(key)}</dt><dd>{display(value)}</dd></div>)}</dl> : <p>No valid live telemetry received yet. Configure the broker and publish to the assigned topic.</p>}
      <small>Cycle and duration values use the publisher’s original units.</small>
    </section></div>}
  </section>;
}
