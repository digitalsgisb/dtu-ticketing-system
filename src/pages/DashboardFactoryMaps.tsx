import { Link } from "react-router-dom";
import { SendayanMapPreview } from "./FactoryMap";
import { PortKlangMap } from "./PortKlangMap";
import "./factory-map.css";

export default function DashboardFactoryMaps() {
  return <section className="dashboard-factory-section" aria-label="Factory maps">
    <div className="dashboard-factory-heading"><div><span className="eyebrow">Our plants</span><h2>Factory overview</h2></div><span>Interactive 3D layouts</span></div>
    <div className="dashboard-factory-maps">
      <div className="dashboard-factory-card"><PortKlangMap compact /><Link className="dashboard-factory-open" to="/factory-map?site=port-klang">Explore Port Klang ↗</Link></div>
      <div className="dashboard-factory-card"><SendayanMapPreview /><Link className="dashboard-factory-open" to="/factory-map?site=sendayan">Explore Sendayan ↗</Link></div>
    </div>
  </section>;
}
