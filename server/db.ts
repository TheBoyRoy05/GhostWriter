import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

// Append only: a database records how many of these files it has run in PRAGMA user_version,
// so editing, renaming or reordering a shipped file leaves existing databases out of sync.
export const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8"));

const schemaVersion = (db: Database) => (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;

export function migrate(db: Database, migrations: readonly string[] = MIGRATIONS) {
  const applied = schemaVersion(db);
  if (applied > migrations.length) {
    throw new Error(`Database is at schema version ${applied}, newer than this code (${migrations.length})`);
  }
  db.transaction(() => {
    for (const [index, sql] of migrations.slice(applied).entries()) {
      db.run(sql);
      db.run(`PRAGMA user_version = ${applied + index + 1}`);
    }
  })();
}

export function openDatabase(path: string) {
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}
