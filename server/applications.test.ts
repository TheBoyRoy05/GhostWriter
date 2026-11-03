import { describe, expect, test } from "bun:test";
import { openDatabase } from "./db";
import { addApplication } from "./applications";

const open = () => openDatabase(":memory:");
const rowOf = (db: ReturnType<typeof open>, id: number) =>
  db.query("SELECT description, link, source FROM applications WHERE id = ?").get(id);
const countOf = (db: ReturnType<typeof open>) => (db.query("SELECT COUNT(*) AS n FROM applications").get() as { n: number }).n;

describe("addApplication", () => {
  test("creates a row with trimmed description, link and derived source", () => {
    const db = open();
    const { id, created } = addApplication(db, { text: "  SWE Intern\n", link: "https://www.linkedin.com/jobs/view/1" });
    expect(created).toBe(true);
    expect(rowOf(db, id)).toEqual({ description: "SWE Intern", link: "https://www.linkedin.com/jobs/view/1", source: "linkedin" });
  });

  test.each([
    ["https://linkedin.com/jobs/view/1", "linkedin"],
    ["https://simplify.jobs/p/abc", "simplify"],
    ["https://jobs.simplify.jobs/p/abc", "simplify"],
    ["https://careers.acme.com/42", "website"],
    ["https://notlinkedin.com/jobs", "website"],
  ])("derives source of %s as %s", (link, source) => {
    const db = open();
    const { id } = addApplication(db, { text: "Job", link });
    expect((rowOf(db, id) as { source: string }).source).toBe(source);
  });

  test.each([undefined, null, "", "   "])("link %p is stored as no link and no source", (link) => {
    const db = open();
    const { id } = addApplication(db, { text: "Job", link });
    expect(rowOf(db, id)).toEqual({ description: "Job", link: null, source: null });
  });

  test("stores the link without tracking params, fragment or padding, keeping job-id params", () => {
    const db = open();
    const link = "  https://www.LinkedIn.com/jobs/search?currentJobId=7&trk=abc&refId=x&utm_source=mail#top ";
    const { id } = addApplication(db, { text: "Job", link });
    expect((rowOf(db, id) as { link: string }).link).toBe("https://www.linkedin.com/jobs/search?currentJobId=7");
  });

  test("same posting returns the existing application and keeps its first description", () => {
    const db = open();
    const first = addApplication(db, { text: "Job", link: "https://acme.com/1" });
    const again = addApplication(db, { text: "Job, edited", link: " https://acme.com/1?utm_medium=share " });
    expect(again).toEqual({ id: first.id, created: false });
    expect(countOf(db)).toBe(1);
    expect((rowOf(db, first.id) as { description: string }).description).toBe("Job");
  });

  test("pastes without a link never merge", () => {
    const db = open();
    addApplication(db, { text: "Job" });
    addApplication(db, { text: "Job" });
    expect(countOf(db)).toBe(2);
  });

  test("database refuses two rows with the same link", () => {
    const db = open();
    db.run("INSERT INTO applications (link) VALUES ('https://acme.com/1')");
    expect(() => db.run("INSERT INTO applications (link) VALUES ('https://acme.com/1')")).toThrow();
  });

  test("text padded past the limit is measured after trimming", () => {
    const db = open();
    const { created } = addApplication(db, { text: `  ${"x".repeat(200_000)}  ` });
    expect(created).toBe(true);
  });

  test.each<[string, unknown]>([
    ["Application must be an object", []],
    ["text must be a non-empty string", { text: "  " }],
    ["text must be a non-empty string", { text: 42 }],
    ["text is over 200000 characters", { text: "x".repeat(200_001) }],
    ["link must be a URL", { text: "Job", link: 42 }],
    ["link must be a URL", { text: "Job", link: "not a url" }],
    ["link must be http or https", { text: "Job", link: "javascript:alert(1)" }],
    ["link must be http or https", { text: "Job", link: "ftp://acme.com/job" }],
  ])("rejects with '%s' and writes nothing", (message, body) => {
    const db = open();
    expect(() => addApplication(db, body)).toThrow(message);
    expect(countOf(db)).toBe(0);
  });
});
