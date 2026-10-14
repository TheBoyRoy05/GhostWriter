// Scores every resume bullet against each saved posting with Jev, to check the ranking before building on it.
// Usage: bun scripts/score_postings.ts [posting-file ...]   (defaults to every file in data/postings/)
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { openDatabase } from "../server/db";

const ROOT = join(import.meta.dir, "..");
const POSTINGS = join(ROOT, "data/postings");
const SCORES = join(ROOT, "data/scores");
const MODEL = "typesafe/jev-1.13";
// Jev caps one request at 32 questions.
const QUESTIONS_PER_REQUEST = 32;
const LEVELS = [
  "Irrelevant to the role",
  "Loosely related skills",
  "Clearly relevant to a responsibility or qualification",
  "Directly demonstrates a core responsibility of the role",
];

type Bullet = { key: string; kind: string; sourceId: string; index: number; item: string; text: string };
type ScoreAnswer = { score: number; confidence: number };

function loadBullets(): Bullet[] {
  const db = openDatabase(join(ROOT, "data/ghostwriter.db"));
  const rows = db
    .query("SELECT kind, source_id, data FROM resume_items WHERE kind IN ('experiences', 'projects') ORDER BY kind, sort")
    .all() as { kind: string; source_id: string; data: string }[];
  return rows.flatMap(({ kind, source_id, data }) => {
    const entry = JSON.parse(data);
    const item = kind === "experiences" ? `${entry.title} at ${entry.company}` : `Project: ${entry.title}`;
    return (entry.description as string[]).map((text, index) => ({
      key: `${source_id}_${index}`,
      kind,
      sourceId: source_id,
      index,
      item,
      text,
    }));
  });
}

async function scoreBatch(apiKey: string, posting: string, bullets: Bullet[]) {
  const questions = Object.fromEntries(
    bullets.map((b) => [
      b.key,
      {
        type: "score",
        instructions: `How well does this resume bullet match the job posting? ${b.item}. Bullet: ${b.text}`,
        criteria: LEVELS,
      },
    ]),
  );
  const res = await fetch("https://openrouter.ai/api/v1/systemone", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, state: posting, questions }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ answers: Record<string, ScoreAnswer>; provider?: string; usage?: { cost?: number } }>;
}

async function scorePosting(apiKey: string, file: string, bullets: Bullet[]) {
  const [url, title, ...body] = (await Bun.file(file).text()).split("\n");
  const posting = `${title}\n${body.join("\n").trim()}`;
  const batches = [];
  for (let i = 0; i < bullets.length; i += QUESTIONS_PER_REQUEST) batches.push(bullets.slice(i, i + QUESTIONS_PER_REQUEST));
  const responses = await Promise.all(batches.map((batch) => scoreBatch(apiKey, posting, batch)));

  const answers = Object.assign({}, ...responses.map((r) => r.answers)) as Record<string, ScoreAnswer>;
  const ranked = bullets
    .map((b) => ({ ...b, score: answers[b.key].score, confidence: answers[b.key].confidence }))
    .sort((a, b) => b.score - a.score);
  const result = {
    posting: basename(file, ".txt"),
    url,
    title,
    providers: [...new Set(responses.map((r) => r.provider))],
    cost: responses.reduce((sum, r) => sum + (r.usage?.cost ?? 0), 0),
    ranked,
  };
  await Bun.write(join(SCORES, `${result.posting}.json`), JSON.stringify(result, null, 2));
  return result;
}

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error("OPENROUTER_API_KEY not set in .env");
const files = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync(POSTINGS).filter((f) => f.endsWith(".txt")).map((f) => join(POSTINGS, f));
const bullets = loadBullets();

let total = 0;
for (const file of files) {
  const r = await scorePosting(apiKey, file, bullets);
  total += r.cost;
  const line = (b: (typeof r.ranked)[number]) => `  ${b.score.toFixed(2)}  ${b.item.slice(0, 40).padEnd(40)}  ${b.text.slice(0, 70)}`;
  console.log(`\n${r.posting}  (${r.providers.join(", ")}, $${r.cost.toFixed(6)})`);
  r.ranked.slice(0, 5).forEach((b) => console.log(line(b)));
  console.log("  ...");
  r.ranked.slice(-3).forEach((b) => console.log(line(b)));
}
console.log(`\n${bullets.length} bullets x ${files.length} postings, total $${total.toFixed(6)}`);
