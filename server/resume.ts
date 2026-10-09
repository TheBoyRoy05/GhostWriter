import type { Database } from "bun:sqlite";

export const RESUME_KINDS = ["experiences", "education", "projects", "certifications", "skills"] as const;
type Kind = (typeof RESUME_KINDS)[number];
type Item = { id: string } & Record<string, unknown>;
export type ScrapedResume = Record<Kind, Item[]>;

function validate(resume: unknown): ScrapedResume {
  if (typeof resume !== "object" || resume === null) throw new Error("Resume must be an object");
  const body = resume as Record<string, unknown>;
  for (const kind of RESUME_KINDS) {
    const items = body[kind];
    if (!Array.isArray(items)) throw new Error(`${kind} must be an array`);
    for (const item of items) {
      // A stale extension build emits entries without LinkedIn ids; reject rather than key them on nothing.
      if (typeof item?.id !== "string" || !item.id) throw new Error(`${kind} entry missing id; rebuild and reload the extension`);
    }
  }
  if (RESUME_KINDS.every((kind) => (body[kind] as unknown[]).length === 0)) {
    throw new Error("Scraped resume is empty, so the database was left untouched. LinkedIn markup may have changed.");
  }
  return body as ScrapedResume;
}

// Replaces the stored resume with the scrape: upserts by LinkedIn id, drops entries LinkedIn no longer has.
// A kind that scrapes empty while rows exist is kept: a page that failed to render once wiped skills this way.
export function syncResume(db: Database, resume: unknown) {
  const scraped = validate(resume);
  // synced_at marks when this content first appeared, so history's valid_from stays truthful across no-op rescrapes.
  const upsert = db.query(
    `INSERT INTO resume_items (kind, source_id, sort, data) VALUES (?, ?, ?, ?)
     ON CONFLICT (kind, source_id) DO UPDATE SET sort = excluded.sort, data = excluded.data,
       synced_at = CASE WHEN data IS NOT excluded.data THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE synced_at END
     WHERE data IS NOT excluded.data OR sort IS NOT excluded.sort`,
  );
  const prune = db.query("DELETE FROM resume_items WHERE kind = ? AND source_id NOT IN (SELECT value FROM json_each(?))");
  const stored = db.query("SELECT count(*) AS n FROM resume_items WHERE kind = ?");
  const kept: Kind[] = [];
  db.transaction(() => {
    for (const kind of RESUME_KINDS) {
      if (scraped[kind].length === 0 && (stored.get(kind) as { n: number }).n > 0) {
        kept.push(kind);
        continue;
      }
      for (const [sort, { id, ...data }] of scraped[kind].entries()) upsert.run(kind, id, sort, JSON.stringify(data));
      prune.run(kind, JSON.stringify(scraped[kind].map((item) => item.id)));
    }
  })();
  return { kept };
}

export function readResume(db: Database) {
  const rows = db.query("SELECT kind, data FROM resume_items ORDER BY kind, sort").all() as { kind: Kind; data: string }[];
  const resume = Object.fromEntries(RESUME_KINDS.map((kind) => [kind, [] as Record<string, unknown>[]])) as Record<Kind, Record<string, unknown>[]>;
  for (const row of rows) resume[row.kind].push(JSON.parse(row.data));
  return { ...resume, skills: resume.skills.map((skill) => skill.name as string) };
}
