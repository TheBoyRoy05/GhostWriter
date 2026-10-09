import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { unlinkSync } from "node:fs";
import { MIGRATIONS, migrate, openDatabase } from "./db";

const open = () => openDatabase(":memory:");
const versionOf = (db: Database) => (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;

describe("migrate", () => {
  test("fresh database ends at the latest version", () => {
    expect(versionOf(open())).toBe(MIGRATIONS.length);
  });

  test("runs only the steps past the recorded version", () => {
    const db = new Database(":memory:");
    migrate(db, ["CREATE TABLE a (x)"]);
    migrate(db, ["CREATE TABLE a (x)", "ALTER TABLE a ADD COLUMN y"]);
    expect(versionOf(db)).toBe(2);
    expect(db.query("SELECT name FROM pragma_table_info('a')").all()).toEqual([{ name: "x" }, { name: "y" }]);
  });

  test("failed step rolls back every step in the same run", () => {
    const db = new Database(":memory:");
    expect(() => migrate(db, ["CREATE TABLE a (x)", "NOT SQL"])).toThrow();
    expect(versionOf(db)).toBe(0);
    expect(db.query("SELECT name FROM sqlite_master WHERE name = 'a'").all()).toEqual([]);
  });

  test("refuses a database newer than the code", () => {
    const db = new Database(":memory:");
    db.run("PRAGMA user_version = 5");
    expect(() => migrate(db, ["CREATE TABLE a (x)"])).toThrow(/newer than this code/);
  });
});

describe("schema", () => {
  test("opening twice on the same file keeps existing rows", () => {
    const path = `/tmp/ghostwriter-schema-${crypto.randomUUID()}.db`;
    openDatabase(path).run("INSERT INTO applications (company) VALUES ('Acme')");
    const rows = openDatabase(path).query("SELECT company FROM applications").all();
    expect(rows).toEqual([{ company: "Acme" }]);
    for (const suffix of ["", "-wal", "-shm"]) unlinkSync(path + suffix);
  });

  test("profile allows exactly one row", () => {
    const db = open();
    db.run("INSERT INTO profile (id, data) VALUES (1, '{}')");
    expect(() => db.run("INSERT INTO profile (id, data) VALUES (2, '{}')")).toThrow();
  });

  test("profile rejects invalid JSON", () => {
    expect(() => open().run("INSERT INTO profile (id, data) VALUES (1, 'not json')")).toThrow();
  });

  test.each([
    ["pay_unit", "week"],
    ["location_type", "onsite"],
    ["cover_letter", "maybe"],
    ["source", "indeed"],
  ])("applications rejects %s = %s", (column, value) => {
    expect(() => open().run(`INSERT INTO applications (${column}) VALUES (?)`, [value])).toThrow();
  });

  test("applications accepts one valid value per enum column", () => {
    const db = open();
    db.run(
      "INSERT INTO applications (pay_unit, location_type, cover_letter, source) VALUES ('hour', 'remote', 'none', 'linkedin')",
    );
    expect(db.query("SELECT COUNT(*) AS n FROM applications").get()).toEqual({ n: 1 });
  });

  test("applications defaults contacts to an empty list and cover_letter_sent to false", () => {
    const db = open();
    db.run("INSERT INTO applications (company) VALUES ('Acme')");
    expect(db.query("SELECT contacts, cover_letter_sent FROM applications").get()).toEqual({
      contacts: "[]",
      cover_letter_sent: 0,
    });
  });

  test("status event needs an existing application and gets a timestamp", () => {
    const db = open();
    expect(() => db.run("INSERT INTO status_events (application_id, status) VALUES (99, 'sent')")).toThrow();
    const { id } = db.query("INSERT INTO applications (company) VALUES ('Acme') RETURNING id").get() as { id: number };
    db.run("INSERT INTO status_events (application_id, status) VALUES (?, 'sent')", [id]);
    const event = db.query("SELECT at FROM status_events").get() as { at: string };
    expect(event.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("deleting an application deletes its status events", () => {
    const db = open();
    db.run("INSERT INTO applications (id, company) VALUES (1, 'Acme')");
    db.run("INSERT INTO status_events (application_id, status) VALUES (1, 'sent')");
    db.run("DELETE FROM applications WHERE id = 1");
    expect(db.query("SELECT COUNT(*) AS n FROM status_events").get()).toEqual({ n: 0 });
  });
});
