import { useEffect, useState } from "react";
import { api, json } from "../api";
import { useAuth } from "../auth";
import "./category-box.css";

const categories = ["AI", "IoT", "Software", "Automation", "Infrastructure", "Other"];
export function CategoryBox({ id, name, category, kind = "project", onSaved }: { id: number; name?: string; category?: string; kind?: "project" | "request"; onSaved?: () => unknown }) {
  const { user } = useAuth();
  const [value, setValue] = useState(category || "Other");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setValue(category || "Other"); }, [category, id]);
  const save = async (next: string) => {
    setBusy(true); setError("");
    try {
      await api("/api/staff/monthly-review/category", json("PATCH", { kind, id, category: next }));
      setValue(next); await onSaved?.();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const editable = user?.role === "admin" || user?.role === "lead";
  return <span className="category-box" data-category={value} onClick={event => event.stopPropagation()}>
    {editable ? <select aria-label={`Category for ${name || `${kind} ${id}`}`} disabled={busy} value={value} onChange={event => void save(event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select> : <span className="category-box-label">{value}</span>}
    {busy && <small role="status">Saving…</small>}{error && <small role="alert">{error}</small>}
  </span>;
}
