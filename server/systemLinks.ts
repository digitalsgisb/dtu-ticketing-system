import { z } from "zod";
import { cleanText } from "./services.js";

/** Projects and project groups each hold up to four titled system links. */
export const maxSystemLinks = 4;

export const systemLinkSchema = z.object({
  title: z.string().trim().max(80).optional().default(""),
  url: z.string().trim().max(1000).optional().default("")
});

export type SystemLinkInput = { title: string; url: string };

export function normalizeSystemUrl(value: string) {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(candidate);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
    throw new Error("Use a valid http or https link");
  }
  const normalized = url.toString();
  if (normalized.length > 1000) throw new Error("System link URLs must be 1000 characters or fewer");
  return normalized;
}

/** Validate submitted link slots, skipping fully empty slots and keeping the submitted order. */
export function parseSystemLinks(value: unknown) {
  const parsed = z.array(systemLinkSchema).max(maxSystemLinks).safeParse(value ?? []);
  if (!parsed.success) return { ok: false as const, error: `Add up to ${maxSystemLinks} system links` };
  const links: SystemLinkInput[] = [];
  try {
    for (const link of parsed.data) {
      const title = cleanText(link.title, 80);
      const rawUrl = cleanText(link.url, 1000);
      if (!title && !rawUrl) continue;
      if (!title || !rawUrl) return { ok: false as const, error: "Each system link needs both a title and URL" };
      links.push({ title, url: normalizeSystemUrl(rawUrl) });
    }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Check the system links" };
  }
  return { ok: true as const, links };
}
