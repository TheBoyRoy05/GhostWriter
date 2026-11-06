import type { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RELEVANCE_LEVELS, scoreQuestions } from "./jev";
import { buildLatexFromMatcherResult, compileLatex, type MatcherJsonResult } from "./latex";
import type { Profile } from "./profile";
import type { readResume } from "./resume";
import { SKILL_ROW_NAMES, skillRowsOf, type SkillRow } from "./skills";

const ITEM_LIMITS = { experiences: { min: 1, max: 4 }, projects: { min: 0, max: 4 } };
const MIN_BULLETS_PER_ITEM = 2;
const MIN_BULLET_WORDS = 5;
const SKILLS_PER_ROW = 10;

type Resume = ReturnType<typeof readResume>;
type Entry = Record<string, unknown>;
type ItemKind = keyof typeof ITEM_LIMITS;
const ITEM_KINDS = Object.keys(ITEM_LIMITS) as ItemKind[];
type Bullet = { text: string; score: number };
type SelectedItem = { entry: Entry; bullets: Bullet[] };
export type Selection = Record<ItemKind, SelectedItem[]> & { skills: Record<SkillRow, string[]> };

// Scores the resume against the posting, picks items, bullets and skills, and trims bullets until it fits one page.
export async function tailorResume(db: Database, apiKey: string, job: string, resume: Resume, profile: Profile) {
  const [{ scores, cost }, skillRows] = await Promise.all([scoreResume(apiKey, job, resume), skillRowsOf(db, apiKey, resume.skills)]);
  const render = (selection: Selection) => buildLatexFromMatcherResult(toMatcherResult(selection, resume.certifications), profile, resume);

  const dir = await mkdtemp(join(tmpdir(), "ghostwriter-fit-"));
  try {
    const fitted = await fitToOnePage(selectResume(resume, scores, skillRows.rows), (selection) => compileLatex(dir, render(selection)));
    const warning = fitted.pages > 1 ? `Resume is ${fitted.pages} pages: no bullet can drop without breaking the item limits` : undefined;
    return {
      ...fitted,
      latex: render(fitted.selection),
      warning,
      questions: Object.keys(scores).length,
      classified: skillRows.classified,
      cost: cost + skillRows.cost,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function scoreResume(apiKey: string, job: string, resume: Resume) {
  const instructions: Record<string, string> = {};
  for (const kind of ITEM_KINDS) {
    resume[kind].forEach((entry, item) =>
      eligibleBullets(entry).forEach(({ text, index }) => {
        instructions[`${kind}/${item}/${index}`] = bulletQuestion(itemLabel(kind, entry), text);
      }),
    );
  }
  resume.skills.forEach((skill, index) => {
    instructions[`skills/${index}`] = `How well does this resume skill match the job posting? Skill: ${skill}`;
  });

  const { answers, cost } = await scoreQuestions(apiKey, job, instructions, RELEVANCE_LEVELS);
  return { scores: Object.fromEntries(Object.entries(answers).map(([key, answer]) => [key, answer.score])), cost };
}

export function bulletQuestion(item: string, bullet: string) {
  return `How well does this resume bullet match the job posting? ${item}. Bullet: ${bullet}`;
}

// Keeps each kind's best-scoring items within its limits, in resume order with bullets verbatim, and each row's best skills.
export function selectResume(resume: Resume, scores: Record<string, number>, skillRows: Record<string, SkillRow>): Selection {
  const pick = (kind: ItemKind) => {
    const candidates = resume[kind]
      .map((entry, item) => ({
        item,
        entry,
        bullets: eligibleBullets(entry).map(({ text, index }) => ({ text, score: scores[`${kind}/${item}/${index}`] })),
      }))
      .filter((candidate) => candidate.bullets.length >= MIN_BULLETS_PER_ITEM);
    if (candidates.length < ITEM_LIMITS[kind].min) {
      throw new Error(`Need ${ITEM_LIMITS[kind].min} ${kind} with ${MIN_BULLETS_PER_ITEM}+ bullets of ${MIN_BULLET_WORDS}+ words`);
    }
    return candidates
      .toSorted((a, b) => itemScore(b.bullets) - itemScore(a.bullets))
      .slice(0, ITEM_LIMITS[kind].max)
      .toSorted((a, b) => a.item - b.item)
      .map(({ entry, bullets }) => ({ entry, bullets }));
  };

  const scored = resume.skills.map((name, index) => ({ name, score: scores[`skills/${index}`] }));
  const rowOf = (row: SkillRow) =>
    scored
      .filter((skill) => skillRows[skill.name] === row)
      .toSorted((a, b) => b.score - a.score)
      .slice(0, SKILLS_PER_ROW)
      .map((skill) => skill.name);
  const skills = Object.fromEntries(SKILL_ROW_NAMES.map((row) => [row, rowOf(row)])) as Record<SkillRow, string[]>;

  return { experiences: pick("experiences"), projects: pick("projects"), skills };
}

// Finds the fewest bullet drops that fit one page by binary search, so it compiles at most 1 + ceil(log2(drops + 1)) times.
// Each drop takes the lowest-scored bullet that leaves every limit intact; the search relies on pages never growing as bullets go.
export async function fitToOnePage(selection: Selection, pagesOf: (selection: Selection) => Promise<number>) {
  const steps = [selection];
  for (let next = dropLowestBullet(selection); next; next = dropLowestBullet(next)) steps.push(next);

  let compiles = 1;
  let best = { dropped: 0, pages: await pagesOf(selection) };
  if (best.pages <= 1) return { selection, ...best, compiles };

  let low = 1;
  let high = steps.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const pages = await pagesOf(steps[mid]);
    compiles++;
    // When nothing fits, the search ends on the last step, which is what gets returned.
    if (pages <= 1 || mid === steps.length - 1) best = { dropped: mid, pages };
    if (pages <= 1) high = mid - 1;
    else low = mid + 1;
  }
  return { selection: steps[best.dropped], ...best, compiles };
}

export function toMatcherResult(selection: Selection, certifications: Entry[]): MatcherJsonResult {
  const withBullets = ({ entry, bullets }: SelectedItem) => ({ ...entry, description: bullets.map((b) => b.text) });
  return {
    experiences: selection.experiences.map(withBullets),
    projects: selection.projects.map(withBullets),
    ...selection.skills,
    certifications: certifications.map((certification) => certification.name).filter((name): name is string => typeof name === "string" && name !== ""),
  };
}

function itemLabel(kind: ItemKind, entry: Entry) {
  return kind === "experiences" ? `${entry.title} at ${entry.company}` : `Project: ${entry.title}`;
}

// Ranks by the top two bullets, so an item does not win on bullet count alone.
function itemScore(bullets: Bullet[]) {
  const top = bullets.map((b) => b.score).toSorted((a, b) => b - a).slice(0, MIN_BULLETS_PER_ITEM);
  return top.reduce((sum, score) => sum + score, 0) / top.length;
}

// A bullet from an item at the bullet minimum takes the whole item with it.
function dropLowestBullet(selection: Selection): Selection | null {
  let lowest: { kind: ItemKind; item: number; bullet: number; score: number } | null = null;
  for (const kind of ITEM_KINDS) {
    const items = selection[kind];
    for (const [item, { bullets }] of items.entries()) {
      if (bullets.length === MIN_BULLETS_PER_ITEM && items.length === ITEM_LIMITS[kind].min) continue;
      for (const [bullet, { score }] of bullets.entries()) {
        // <= so ties drop the later bullet, which sits lower on the page.
        if (!lowest || score <= lowest.score) lowest = { kind, item, bullet, score };
      }
    }
  }
  if (!lowest) return null;

  const { kind, item, bullet } = lowest;
  const items = selection[kind].flatMap((selected, i) => {
    if (i !== item) return [selected];
    if (selected.bullets.length === MIN_BULLETS_PER_ITEM) return [];
    return [{ ...selected, bullets: selected.bullets.filter((_, b) => b !== bullet) }];
  });
  return { ...selection, [kind]: items };
}

function eligibleBullets(entry: Entry) {
  return ((entry.description as string[] | undefined) ?? [])
    .map((text, index) => ({ text, index }))
    .filter(({ text }) => text.trim().split(/\s+/).length >= MIN_BULLET_WORDS);
}
