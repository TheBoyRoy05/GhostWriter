import type { Database } from "bun:sqlite";
import { scoreQuestions } from "./jev";

export const SKILL_ROWS = {
  languages: "programming languages",
  tools: "tools, frameworks and platforms",
  domain: "domain knowledge and practices",
};
export type SkillRow = keyof typeof SKILL_ROWS;
export const SKILL_ROW_NAMES = Object.keys(SKILL_ROWS) as SkillRow[];
const CATEGORY_LEVELS = [
  "Not in this category",
  "Loosely related to this category",
  "Partly in this category",
  "Squarely in this category",
];

// Returns each skill's Technical Skills row, asking Jev only about skills with no stored skill_row.
export async function skillRowsOf(db: Database, apiKey: string, skills: string[]) {
  const stored = db
    .query("SELECT json_extract(data, '$.name') AS skill, skill_row AS row FROM resume_items WHERE kind = 'skills' AND skill_row IS NOT NULL")
    .all() as { skill: string; row: SkillRow }[];
  const rows = new Map(stored.map((r) => [r.skill, r.row]));
  const unclassified = [...new Set(skills.filter((skill) => !rows.has(skill)))];
  let cost = 0;

  if (unclassified.length) {
    const instructions: Record<string, string> = {};
    unclassified.forEach((skill, index) => {
      for (const row of SKILL_ROW_NAMES) instructions[`${row}/${index}`] = `How well does the resume skill "${skill}" fit the category ${SKILL_ROWS[row]}?`;
    });
    // The state names no posting, so the answer depends on the skill alone.
    const scored = await scoreQuestions(apiKey, "A skill listed on a resume", instructions, CATEGORY_LEVELS);
    cost = scored.cost;

    const store = db.query("UPDATE resume_items SET skill_row = ? WHERE kind = 'skills' AND json_extract(data, '$.name') = ?");
    db.transaction(() => {
      unclassified.forEach((skill, index) => {
        const scoreOf = (row: SkillRow) => scored.answers[`${row}/${index}`].score;
        const row = SKILL_ROW_NAMES.reduce((best, next) => (scoreOf(next) > scoreOf(best) ? next : best));
        store.run(row, skill);
        rows.set(skill, row);
      });
    })();
  }

  return { rows: Object.fromEntries(skills.map((skill) => [skill, rows.get(skill) as SkillRow])), classified: unclassified.length, cost };
}
