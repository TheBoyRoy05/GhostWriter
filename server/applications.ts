import type { Database } from "bun:sqlite";

// A posting page's innerText runs to tens of KB; anything past this is not a job description.
const MAX_DESCRIPTION_CHARS = 200_000;

// Share and tracking params differ per click on the same posting, so they must not split one job into two rows.
const TRACKING_PARAMS = ["trk", "refId", "trackingId"];

type Source = "simplify" | "linkedin" | "website";
type Application = { description: string; link: string | null; source: Source | null };

export function addApplication(db: Database, body: unknown) {
  const { description, link, source } = validate(body);

  if (link) {
    const existing = db.query("SELECT id FROM applications WHERE link = ?").get(link) as { id: number } | null;
    if (existing) return { id: existing.id, created: false };
  }

  const { id } = db
    .query("INSERT INTO applications (description, link, source) VALUES (?, ?, ?) RETURNING id")
    .get(description, link, source) as { id: number };
  return { id, created: true };
}

function validate(body: unknown): Application {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("Application must be an object");
  const { text, link } = body as Record<string, unknown>;

  if (typeof text !== "string" || !text.trim()) throw new Error("text must be a non-empty string");
  const description = text.trim();
  if (description.length > MAX_DESCRIPTION_CHARS) throw new Error(`text is over ${MAX_DESCRIPTION_CHARS} characters`);

  if (link === undefined || link === null) return { description, link: null, source: null };
  if (typeof link !== "string") throw new Error("link must be a URL");
  if (!link.trim()) return { description, link: null, source: null };

  const url = URL.parse(link.trim());
  if (!url) throw new Error("link must be a URL");
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("link must be http or https");
  return { description, link: canonical(url), source: sourceOf(url.hostname) };
}

function canonical(url: URL) {
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || TRACKING_PARAMS.includes(key)) url.searchParams.delete(key);
  }
  return url.href;
}

function sourceOf(host: string): Source {
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
  if (host === "simplify.jobs" || host.endsWith(".simplify.jobs")) return "simplify";
  return "website";
}
