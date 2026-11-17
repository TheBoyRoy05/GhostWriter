// Tailors a resume for every Jev fixture posting against a temp copy of data/ghostwriter.db and checks the results.
// Usage: bun --env-file=.env scripts/eval_resume.ts [posting-file ...]   (defaults to fixtures/postings/jev/*.txt)
// Set GHOSTWRITER_DB to read a database elsewhere (for example from a git worktree).
// Writes output/eval/<slug>/resume.tex and resume.pdf.
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { openDatabase } from "../server/db";
import { compileLatex } from "../server/latex";
import { readProfile } from "../server/profile";
import { readResume } from "../server/resume";
import { tailorResume } from "../server/select";

const ROOT = join(import.meta.dir, "..");
const DB = process.env.GHOSTWRITER_DB ?? join(ROOT, "data/ghostwriter.db");
const POSTINGS = join(ROOT, "fixtures/postings/jev");
const OUTPUT = join(ROOT, "output/eval");
const NEAR_DUPLICATE_OVERLAP = 0.7;

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error("OPENROUTER_API_KEY not set in .env");

const files = process.argv.length > 2 ? process.argv.slice(2) : readdirSync(POSTINGS).filter((f) => f.endsWith(".txt")).toSorted().map((f) => join(POSTINGS, f));
const tempDir = mkdtempSync(join(tmpdir(), "ghostwriter-eval-"));
try {
  await evaluate();
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

async function evaluate() {
  const db = openCopyOfDatabase();
  const resume = readResume(db);
  const profile = readProfile(db);
  if (!profile?.name) throw new Error("The database has no profile name");

  console.log(`Data check: hobbies ${verdict(Boolean(profile.hobbies?.trim()))}\n`);

  const rows: string[][] = [["posting", "pages", "exp", "proj", "bullets", "1 page", "no dupes", "warning"]];
  let threw = false;
  for (const file of files) {
    const slug = basename(file, ".txt");
    try {
      rows.push(await tailorOne(db, resume, profile, file, slug));
    } catch (error) {
      threw = true;
      rows.push([slug, "", "", "", "", "", "", `FAIL: ${error instanceof Error ? error.message : error}`]);
    }
  }

  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  for (const row of rows) console.log(row.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd());
  const failed = rows.slice(1).reduce((sum, row) => sum + row.slice(5, 7).filter((cell) => cell === "FAIL").length, 0);
  console.log(`\n${failed} failed checks over ${files.length} postings`);
  if (threw) process.exitCode = 1;
}

async function tailorOne(db: Database, resume: ReturnType<typeof readResume>, profile: NonNullable<ReturnType<typeof readProfile>>, file: string, slug: string) {
  const [, title, ...body] = (await Bun.file(file).text()).split("\n");
  const tailored = await tailorResume(db, apiKey!, `${title}\n${body.join("\n").trim()}`, resume, profile);

  const dir = join(OUTPUT, slug);
  mkdirSync(dir, { recursive: true });
  const pages = await compileLatex(dir, tailored.latex);

  const { experiences, projects } = tailored.selection;
  const bullets = [...experiences, ...projects].flatMap((item) => item.bullets.map((bullet) => bullet.text));
  const duplicates = nearDuplicatePairs(bullets);
  duplicates.forEach(([a, b]) => console.log(`  ${slug}: near-duplicate\n    ${a}\n    ${b}`));
  return [slug, String(pages), String(experiences.length), String(projects.length), String(bullets.length), verdict(pages === 1), verdict(duplicates.length === 0), tailored.warning ?? ""];
}

function openCopyOfDatabase() {
  if (!existsSync(DB)) throw new Error(`Database not found: ${DB} (set GHOSTWRITER_DB)`);
  const copyPath = join(tempDir, "ghostwriter.db");
  const source = new Database(DB, { readonly: true });
  try {
    source.run(`VACUUM INTO '${copyPath}'`);
  } finally {
    source.close();
  }
  return openDatabase(copyPath);
}

function verdict(ok: boolean) {
  return ok ? "ok" : "FAIL";
}

function nearDuplicatePairs(bullets: string[]) {
  const tokens = bullets.map((bullet) => new Set(bullet.toLowerCase().match(/[a-z0-9]+/g)));
  const pairs: [string, string][] = [];
  for (let i = 0; i < bullets.length; i++) {
    for (let j = i + 1; j < bullets.length; j++) {
      const shared = [...tokens[i]].filter((token) => tokens[j].has(token)).length;
      if (shared / Math.min(tokens[i].size, tokens[j].size) >= NEAR_DUPLICATE_OVERLAP) pairs.push([bullets[i], bullets[j]]);
    }
  }
  return pairs;
}
