export type ApiError = Error & { status?: number; details?: unknown };

let csrfToken = "";

export function setCsrf(value: string) {
  csrfToken = value;
}

export async function api<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && options.body !== undefined) headers.set("Content-Type", "application/json");
  if (csrfToken && !["GET", "HEAD"].includes(options.method ?? "GET")) headers.set("x-csrf-token", csrfToken);
  const response = await fetch(url, { ...options, headers, credentials: "same-origin" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    const error = new Error(payload.error || "Request failed") as ApiError;
    error.status = response.status;
    error.details = payload.details;
    throw error;
  }
  if (response.status === 204) return undefined as T;
  const type = response.headers.get("content-type") ?? "";
  return type.includes("application/json") ? response.json() : response.text() as T;
}

export function json(method: string, body?: unknown): RequestInit {
  return { method, body: body === undefined ? undefined : JSON.stringify(body) };
}

export function formatDate(value?: string | null, withTime = false) {
  if (!value) return "—";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00`
    : value.includes(" ") && !value.includes("T")
      ? `${value.replace(" ", "T")}Z`
      : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(date);
}

export function humanize(value?: string | null) {
  if (value === "complete_monitoring") return "Complete and Monitoring";
  return value ? value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()) : "—";
}
