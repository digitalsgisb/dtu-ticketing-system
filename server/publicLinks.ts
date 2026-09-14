import type { Request } from "express";

const placeholderSuffixes = [".example.com", ".example.org", ".example.net", ".invalid", ".test"];

export function normalizePublicBaseUrl(value: string, allowLocal = false) {
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol)
      || url.username || url.password || url.search || url.hash
      || placeholderSuffixes.some(suffix => hostname.endsWith(suffix))
      || (!allowLocal && (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "::1"))) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function publicBaseForRequest(req: Request, configured: string) {
  const configuredBase = normalizePublicBaseUrl(configured, false);
  if (configuredBase) return configuredBase;
  const host = req.get("host");
  if (!host || !/^[a-z0-9.:[\]-]+$/i.test(host)) return "";
  return normalizePublicBaseUrl(`${req.protocol}://${host}`, true) ?? "";
}
