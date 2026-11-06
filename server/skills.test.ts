import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { openDatabase } from "./db";
import { skillRowsOf } from "./skills";

type JevRequest = { state: string; questions: Record<string, { instructions: string }> };

// Scores a question 3 when its instructions name the category `rowOf` gives for the skill, else 0.
function stubJev(rowOf: Record<string, string>) {
  const requests: JevRequest[] = [];
  spyOn(globalThis, "fetch").mockImplementation((async (_url: string, init: RequestInit) => {
    const request = JSON.parse(String(init.body)) as JevRequest;
    requests.push(request);
    const answers = Object.fromEntries(
      Object.entries(request.questions).map(([key, { instructions }]) => {
        const skill = instructions.match(/"(.+)"/)?.[1] ?? "";
        return [key, { score: instructions.includes(rowOf[skill]) ? 3 : 0, confidence: 1 }];
      }),
    );
    return Response.json({ answers, usage: { cost: 0.0002 } });
  }) as unknown as typeof fetch);
  return requests;
}

function dbWithSkills(...names: string[]) {
  const db = openDatabase(":memory:");
  const insert = db.query("INSERT INTO resume_items (kind, source_id, sort, data) VALUES ('skills', ?, ?, ?)");
  names.forEach((name, sort) => insert.run(name, sort, JSON.stringify({ id: name, name })));
  return db;
}

afterEach(() => mock.restore());

describe("skillRowsOf", () => {
  test("classifies each skill into the row it fits best, asking with no posting in the state, and stores it on the skill", async () => {
    const db = dbWithSkills("Python", "Docker", "Statistics");
    const requests = stubJev({ Python: "programming languages", Docker: "tools", Statistics: "domain knowledge" });

    const { rows, classified, cost } = await skillRowsOf(db, "key", ["Python", "Docker", "Statistics"]);

    expect(rows).toEqual({ Python: "languages", Docker: "tools", Statistics: "domain" });
    expect(db.query("SELECT skill_row FROM resume_items ORDER BY sort").all()).toEqual([{ skill_row: "languages" }, { skill_row: "tools" }, { skill_row: "domain" }]);
    expect(classified).toBe(3);
    expect(cost).toBe(0.0002);
    expect(requests[0].state).toBe("A skill listed on a resume");
    expect(Object.keys(requests[0].questions)).toHaveLength(9);
  });

  test("asks only about skills not already cached", async () => {
    const db = dbWithSkills("Python", "Docker");
    db.run("UPDATE resume_items SET skill_row = 'languages' WHERE source_id = 'Python'");
    const requests = stubJev({ Docker: "tools" });

    const { rows, classified } = await skillRowsOf(db, "key", ["Python", "Docker"]);
    const again = await skillRowsOf(db, "key", ["Docker", "Python"]);

    expect(rows).toEqual({ Python: "languages", Docker: "tools" });
    expect(classified).toBe(1);
    expect(requests).toHaveLength(1);
    expect(again).toEqual({ rows: { Docker: "tools", Python: "languages" }, classified: 0, cost: 0 });
  });
});
