// Runs extractFields live over fixtures/postings/extract and prints how often each field matches expected.json.
// Usage: bun --env-file=.env scripts/eval_extract.ts [repeats=3]
import { EXTRACTED_FIELDS } from "../shared/applications";
import { extractFields } from "../server/extract";
import { fieldMatches, loadExtractFixtures } from "../server/posting-fixtures";

const repeats = Number(process.argv[2] ?? 3);
if (!Number.isInteger(repeats) || repeats < 1) throw new Error("repeats must be a positive integer");

const fixtures = await loadExtractFixtures();
const rows: string[][] = [["fixture", ...EXTRACTED_FIELDS, "errors"]];
const correct = Object.fromEntries(EXTRACTED_FIELDS.map((field) => [field, 0]));
let scoredRuns = 0;
let errorRuns = 0;

for (const fixture of fixtures) {
  const hits = Object.fromEntries(EXTRACTED_FIELDS.map((field) => [field, 0]));
  let fixtureErrors = 0;
  for (let run = 0; run < repeats; run++) {
    const { fields, error } = await extractFields(fixture.text, fixture.jobPosting);
    if (error) {
      fixtureErrors++;
      continue;
    }
    for (const field of EXTRACTED_FIELDS) {
      if (fieldMatches(fixture, field, fields[field])) hits[field]++;
    }
  }
  const scored = repeats - fixtureErrors;
  scoredRuns += scored;
  errorRuns += fixtureErrors;
  for (const field of EXTRACTED_FIELDS) correct[field] += hits[field];
  rows.push([fixture.slug, ...EXTRACTED_FIELDS.map((field) => ratio(hits[field], scored)), `${fixtureErrors}/${repeats}`]);
}
rows.push(["TOTAL", ...EXTRACTED_FIELDS.map((field) => ratio(correct[field], scoredRuns)), `${errorRuns}/${repeats * fixtures.length}`]);

const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
for (const row of rows) console.log(row.map((cell, column) => cell.padEnd(widths[column])).join("  "));
const allCorrect = Object.values(correct).reduce((sum, n) => sum + n, 0);
console.log(`\n${allCorrect}/${scoredRuns * EXTRACTED_FIELDS.length} fields correct over ${scoredRuns} scored runs; ${errorRuns} runs errored (network, 429 or bad JSON)`);
if (scoredRuns === 0) {
  console.error("Every run errored; nothing was scored");
  process.exitCode = 1;
}

function ratio(hits: number, scored: number) {
  return scored === 0 ? "n/a" : `${hits}/${scored}`;
}
