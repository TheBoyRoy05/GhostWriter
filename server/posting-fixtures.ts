import { readdirSync } from "node:fs";
import { join } from "node:path";
import { EXTRACTED_FIELDS, type ExtractedFields } from "../shared/applications";

export const FIXTURES_DIR = join(import.meta.dir, "../fixtures/postings");

type Field = (typeof EXTRACTED_FIELDS)[number];
export type ExtractFixture = {
  slug: string;
  text: string;
  jobPosting: Record<string, unknown> | null;
  expected: ExtractedFields;
  // Fields compared ignoring case and whitespace.
  loose: Field[];
  // Fields the JSON-LD alone states; the no-network test requires exactly these.
  jsonLdStates: Field[];
};

export async function loadExtractFixtures(): Promise<ExtractFixture[]> {
  const root = join(FIXTURES_DIR, "extract");
  const slugs = readdirSync(root).toSorted();
  return Promise.all(
    slugs.map(async (slug) => {
      const read = (name: string) => Bun.file(join(root, slug, name));
      const { fields, loose, jsonLdStates } = await read("expected.json").json();
      return { slug, text: await read("text.txt").text(), jobPosting: await read("job-posting.json").json(), expected: fields, loose, jsonLdStates };
    }),
  );
}

export function fieldMatches(fixture: ExtractFixture, field: Field, actual: unknown) {
  const expected = fixture.expected[field];
  if (fixture.loose.includes(field) && typeof expected === "string" && typeof actual === "string") return squash(actual) === squash(expected);
  return actual === expected;
}

const squash = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
