import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { openDatabase } from "./db";
import { fitToOnePage, scoreResume, selectResume, tailorResume, toMatcherResult, type Selection } from "./select";

type Resume = Parameters<typeof selectResume>[0];

// Bullets need 5+ words to count; `long` pads a tag so each test bullet qualifies and stays identifiable.
const long = (tag: string) => `${tag} built and shipped the thing`;

function resumeWith(parts: Partial<Resume>): Resume {
  return { experiences: [], education: [], projects: [], certifications: [], skills: [], ...parts };
}

const experience = (title: string, bullets: string[]) => ({ title, company: "Co", description: bullets });
const project = (title: string, bullets: string[]) => ({ title, description: bullets });
const noSkills = { languages: [], tools: [], domain: [] };
const textsOf = (selection: Selection) => ({
  experiences: selection.experiences.map((item) => item.bullets.map((b) => b.text)),
  projects: selection.projects.map((item) => item.bullets.map((b) => b.text)),
});

// Answers every question through `scoreOf`, recording the keys asked.
function stubJev(scoreOf: (key: string, index: number) => number) {
  const asked: string[] = [];
  spyOn(globalThis, "fetch").mockImplementation((async (_url: string, init: RequestInit) => {
    const { questions } = JSON.parse(String(init.body)) as { questions: Record<string, unknown> };
    const answers = Object.fromEntries(Object.keys(questions).map((key) => [key, { score: scoreOf(key, asked.push(key) - 1), confidence: 1 }]));
    return Response.json({ answers, usage: { cost: 0.0005 } });
  }) as unknown as typeof fetch);
  return asked;
}

afterEach(() => mock.restore());

describe("scoreResume", () => {
  test("asks one question per eligible bullet and per skill, keyed by position", async () => {
    const asked = stubJev((_, index) => index);
    const resume = resumeWith({
      experiences: [experience("SDE", [long("a"), "too short to count", long("b")])],
      projects: [project("P", [long("c")])],
      skills: ["TypeScript"],
    });

    const { scores, cost } = await scoreResume("key", "posting", resume);

    expect(asked).toEqual(["experiences/0/0", "experiences/0/2", "projects/0/0", "skills/0"]);
    expect(scores["experiences/0/2"]).toBe(1);
    expect(scores["skills/0"]).toBe(3);
    expect(cost).toBe(0.0005);
  });
});

describe("selectResume", () => {
  test("keeps the four best-scoring items per kind, in resume order, bullets verbatim", () => {
    const experiences = Array.from({ length: 6 }, (_, i) => experience(`E${i}`, [long(`e${i}a`), long(`e${i}b`)]));
    const scores: Record<string, number> = {};
    [1, 3, 0, 2, 3, 2].forEach((score, i) => {
      scores[`experiences/${i}/0`] = score;
      scores[`experiences/${i}/1`] = score;
    });

    const selection = selectResume(resumeWith({ experiences }), scores, {});

    expect(selection.experiences.map((item) => item.entry.title)).toEqual(["E1", "E3", "E4", "E5"]);
    expect(selection.experiences[0].bullets.map((b) => b.text)).toEqual([long("e1a"), long("e1b")]);
  });

  test("drops an item with fewer than two bullets of five or more words", () => {
    const experiences = [experience("Keep", [long("a"), long("b")]), experience("Short", [long("c"), "four words only here"])];
    const scores = { "experiences/0/0": 1, "experiences/0/1": 1, "experiences/1/0": 3 };

    const selection = selectResume(resumeWith({ experiences, projects: [project("Solo", [long("p")])] }), scores, {});

    expect(selection.experiences.map((item) => item.entry.title)).toEqual(["Keep"]);
    expect(selection.projects).toEqual([]);
  });

  test("fails when no experience has two eligible bullets", () => {
    const resume = resumeWith({ experiences: [experience("Short", [long("a")])] });
    expect(() => selectResume(resume, { "experiences/0/0": 3 }, {})).toThrow("Need 1 experiences");
  });

  test("puts each skill in its classified row, best-scored first", () => {
    const resume = resumeWith({ experiences: [experience("E", [long("a"), long("b")])], skills: ["Python", "Docker", "Go", "Statistics"] });
    const scores = { "experiences/0/0": 0, "experiences/0/1": 0, "skills/0": 1, "skills/1": 2.5, "skills/2": 3, "skills/3": 0 };
    const skillRows = { Python: "languages", Docker: "tools", Go: "languages", Statistics: "domain" } as const;

    expect(selectResume(resume, scores, skillRows).skills).toEqual({ languages: ["Go", "Python"], tools: ["Docker"], domain: ["Statistics"] });
  });

  test("keeps the ten best-scored skills per row", () => {
    const skills = Array.from({ length: 13 }, (_, i) => `S${i}`);
    const scores: Record<string, number> = { "experiences/0/0": 0, "experiences/0/1": 0 };
    skills.forEach((_, i) => (scores[`skills/${i}`] = i + 1));
    const skillRows = Object.fromEntries(skills.map((skill) => [skill, "languages" as const]));
    const resume = resumeWith({ experiences: [experience("E", [long("a"), long("b")])], skills });

    const { skills: rows } = selectResume(resume, scores, skillRows);

    expect(rows.languages).toEqual(["S12", "S11", "S10", "S9", "S8", "S7", "S6", "S5", "S4", "S3"]);
    expect(rows.tools).toEqual([]);
  });
});

describe("toMatcherResult", () => {
  test("lists only certifications that have a name", () => {
    const selection: Selection = { experiences: [], projects: [], skills: noSkills };
    const result = toMatcherResult(selection, [{ name: "AWS SAA" }, {}, { name: "" }]);
    expect(result.certifications).toEqual(["AWS SAA"]);
  });
});

describe("fitToOnePage", () => {
  const item = (title: string, scores: number[]) => ({
    entry: { title },
    bullets: scores.map((score, i) => ({ text: `${title}${i}`, score })),
  });
  const bulletCount = (s: Selection) => [...s.experiences, ...s.projects].reduce((n, i) => n + i.bullets.length, 0);

  test("leaves a one-page resume alone after one compile", async () => {
    const selection: Selection = { experiences: [item("E", [1, 2, 3])], projects: [], skills: noSkills };
    const fitted = await fitToOnePage(selection, async () => 1);
    expect(fitted).toEqual({ selection, pages: 1, dropped: 0, compiles: 1 });
  });

  test("drops the lowest-scored bullets until one page", async () => {
    const selection: Selection = { experiences: [item("E", [2, 0.5, 3])], projects: [item("P", [1, 0.2, 2])], skills: noSkills };

    const fitted = await fitToOnePage(selection, async (s) => (bulletCount(s) > 4 ? 2 : 1));

    expect(fitted.dropped).toBe(2);
    expect(fitted.pages).toBe(1);
    expect(textsOf(fitted.selection)).toEqual({ experiences: [["E0", "E2"]], projects: [["P0", "P2"]] });
  });

  test("finds the fewest drops in logarithmic compiles", async () => {
    const experiences = Array.from({ length: 4 }, (_, i) => item(`E${i}`, [3, 2, 1, 0.5]));
    const selection: Selection = { experiences, projects: [], skills: noSkills };
    let compiles = 0;

    const fitted = await fitToOnePage(selection, async (s) => (compiles++, bulletCount(s) > 9 ? 2 : 1));

    expect(fitted.dropped).toBe(7);
    expect(bulletCount(fitted.selection)).toBe(9);
    expect(compiles).toBe(fitted.compiles);
    expect(compiles).toBeLessThanOrEqual(1 + Math.ceil(Math.log2(15)));
  });

  test("drops a whole two-bullet item when its kind stays above the minimum", async () => {
    const selection: Selection = { experiences: [item("E", [3, 3, 3])], projects: [item("P", [0, 2])], skills: noSkills };
    const fitted = await fitToOnePage(selection, async (s) => (s.projects.length ? 2 : 1));
    expect(textsOf(fitted.selection)).toEqual({ experiences: [["E0", "E1", "E2"]], projects: [] });
  });

  test("never drops below one experience or two bullets, and returns the shortest render when nothing fits", async () => {
    const selection: Selection = { experiences: [item("E", [0, 0, 1])], projects: [], skills: noSkills };
    const fitted = await fitToOnePage(selection, async (s) => bulletCount(s));
    expect(fitted.pages).toBe(2);
    expect(textsOf(fitted.selection)).toEqual({ experiences: [["E0", "E2"]], projects: [] });
  });
});

describe("tailorResume", () => {
  test("scores, selects and compiles a one-page resume with Tectonic", async () => {
    stubJev((key) => (key.startsWith("languages/") ? 3 : 1));
    const resume = resumeWith({
      experiences: [experience("SDE", [long("Cut lookups from O(n^2) & 50%"), long("Wrote C:\\tmp ~ tools")])],
      education: [{ school: "UCSD", degree: "BS" }],
      certifications: [{ name: "AWS #1" }],
      skills: ["C++", "Node_js"],
    });

    const tailored = await tailorResume(openDatabase(":memory:"), "key", "posting", resume, { name: "Ann", location: "Austin & Remote" });

    expect(tailored.pages).toBe(1);
    expect(tailored.warning).toBeUndefined();
    expect(tailored.questions).toBe(4);
    expect(tailored.classified).toBe(2);
    expect(tailored.latex).toContain("\\textbf{Languages: }{C++, Node\\_js}");
    expect(tailored.latex).toContain("O(n\\textasciicircum{}2)");
  }, 60_000);

  test("warns when the resume is still over one page after every allowed drop", async () => {
    stubJev(() => 1);
    // The one experience is at its two-bullet minimum, so nothing can drop.
    const page = "Shipped the thing again ".repeat(250);
    const resume = resumeWith({ experiences: [experience("SDE", [page, page])] });

    const tailored = await tailorResume(openDatabase(":memory:"), "key", "posting", resume, { name: "Ann" });

    expect(tailored.pages).toBeGreaterThan(1);
    expect(tailored.warning).toBe(`Resume is ${tailored.pages} pages: no bullet can drop without breaking the item limits`);
  }, 60_000);
});
