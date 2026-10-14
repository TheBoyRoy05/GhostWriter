import type { Database } from "bun:sqlite";

export const PROFILE_TEXT_FIELDS = [
  "name",
  "email",
  "phone",
  "personal_website",
  "github",
  "linkedin",
  "location",
  "hobbies",
] as const;
type TextField = (typeof PROFILE_TEXT_FIELDS)[number];
export type Profile = Partial<Record<TextField, string>> & { citizenship?: boolean };

function validate(body: unknown): Profile {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("Profile must be an object");
  const input = body as Record<string, unknown>;
  const profile: Profile = {};
  for (const field of PROFILE_TEXT_FIELDS) {
    const value = input[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") throw new Error(`${field} must be a string`);
    if (value.trim()) profile[field] = value.trim();
  }
  if (input.citizenship !== undefined && typeof input.citizenship !== "boolean") throw new Error("citizenship must be true or false");
  if (input.citizenship !== undefined) profile.citizenship = input.citizenship as boolean;
  return profile;
}

export function readProfile(db: Database): Profile | null {
  const row = db.query("SELECT data FROM profile WHERE id = 1").get() as { data: string } | null;
  return row ? JSON.parse(row.data) : null;
}

export function writeProfile(db: Database, body: unknown) {
  const profile = validate(body);
  db.query("INSERT OR REPLACE INTO profile (id, data) VALUES (1, ?)").run(JSON.stringify(profile));
  return profile;
}
