import { describe, expect, test } from "bun:test";
import { openDatabase } from "./db";
import { readResume, syncResume } from "./resume";

const empty = { experiences: [], education: [], projects: [], certifications: [], skills: [] };
const scrape = (overrides = {}) => ({
  ...empty,
  experiences: [{ id: "1", title: "Intern", company: "Acme", skills: ["Go"] }],
  skills: [{ id: "44", name: "Python" }],
  ...overrides,
});
const rowsOf = (db: ReturnType<typeof openDatabase>) =>
  db.query("SELECT kind, source_id FROM resume_items ORDER BY kind, sort").all();

describe("syncResume", () => {
  test("stores each entry under its LinkedIn id, without the id inside data", () => {
    const db = openDatabase(":memory:");
    syncResume(db, scrape());
    expect(rowsOf(db)).toEqual([
      { kind: "experiences", source_id: "1" },
      { kind: "skills", source_id: "44" },
    ]);
    expect(readResume(db).experiences).toEqual([{ title: "Intern", company: "Acme", skills: ["Go"] }]);
  });

  test("rescrape updates an entry in place when its title changes", () => {
    const db = openDatabase(":memory:");
    syncResume(db, scrape());
    syncResume(db, scrape({ experiences: [{ id: "1", title: "Engineer", company: "Acme", skills: [] }] }));
    expect(readResume(db).experiences.map((e) => e.title)).toEqual(["Engineer"]);
  });

  test("rescrape drops entries LinkedIn no longer has and keeps LinkedIn's order", () => {
    const db = openDatabase(":memory:");
    syncResume(db, scrape({ projects: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }] }));
    syncResume(db, scrape({ projects: [{ id: "c", title: "C" }, { id: "a", title: "A" }] }));
    expect(readResume(db).projects.map((p) => p.title)).toEqual(["C", "A"]);
  });

  test("a kind that scrapes empty keeps its stored rows and is reported", () => {
    const db = openDatabase(":memory:");
    syncResume(db, scrape());
    expect(syncResume(db, scrape({ skills: [] }))).toEqual({ kept: ["skills"] });
    expect(readResume(db).skills).toEqual(["Python"]);
  });

  test("an entirely empty scrape is refused and changes nothing", () => {
    const db = openDatabase(":memory:");
    syncResume(db, scrape());
    expect(() => syncResume(db, empty)).toThrow(/empty/);
    expect(rowsOf(db)).toHaveLength(2);
  });

  test("an entry without an id is refused before any write", () => {
    const db = openDatabase(":memory:");
    expect(() => syncResume(db, scrape({ projects: [{ title: "No id" }] }))).toThrow(/missing id/);
    expect(rowsOf(db)).toEqual([]);
  });

  test("readResume gives the generator skill names, not records", () => {
    const db = openDatabase(":memory:");
    syncResume(db, scrape());
    expect(readResume(db).skills).toEqual(["Python"]);
  });
});

describe("resume_item_history", () => {
  const history = (db: ReturnType<typeof openDatabase>) =>
    db.query("SELECT kind, source_id, json_extract(data, '$.title') AS title, change FROM resume_item_history ORDER BY valid_from").all();

  test("an edited entry keeps its old content, dated from first sync to the edit", async () => {
    const db = openDatabase(":memory:");
    syncResume(db, scrape());
    const firstSeen = (db.query("SELECT synced_at FROM resume_items WHERE source_id = '1'").get() as { synced_at: string }).synced_at;
    await Bun.sleep(5);
    syncResume(db, scrape({ experiences: [{ id: "1", title: "Engineer", company: "Acme", skills: [] }] }));
    expect(history(db)).toEqual([{ kind: "experiences", source_id: "1", title: "Intern", change: "updated" }]);
    const row = db.query("SELECT valid_from, valid_to FROM resume_item_history").get() as { valid_from: string; valid_to: string };
    expect(row.valid_from).toBe(firstSeen);
    expect(row.valid_to > row.valid_from).toBe(true);
  });

  test("an entry removed from LinkedIn moves to history as deleted", () => {
    const db = openDatabase(":memory:");
    syncResume(db, scrape({ projects: [{ id: "a", title: "A" }, { id: "b", title: "B" }] }));
    syncResume(db, scrape({ projects: [{ id: "a", title: "A" }] }));
    expect(history(db)).toEqual([{ kind: "projects", source_id: "b", title: "B", change: "deleted" }]);
  });

  test("an unchanged or merely reordered rescrape writes no history and keeps first-seen time", async () => {
    const db = openDatabase(":memory:");
    const projects = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
    syncResume(db, scrape({ projects }));
    const before = db.query("SELECT source_id, synced_at FROM resume_items ORDER BY source_id").all();
    // synced_at has millisecond resolution; without a gap a wrongly refreshed timestamp looks unchanged.
    await Bun.sleep(5);
    syncResume(db, scrape({ projects }));
    await Bun.sleep(5);
    syncResume(db, scrape({ projects: [...projects].reverse() }));
    expect(history(db)).toEqual([]);
    expect(db.query("SELECT source_id, synced_at FROM resume_items ORDER BY source_id").all()).toEqual(before);
    expect(readResume(db).projects.map((p) => p.title)).toEqual(["B", "A"]);
  });
});
