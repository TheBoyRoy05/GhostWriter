import { describe, expect, test } from "bun:test";
import { openDatabase } from "./db";
import { readProfile, writeProfile } from "./profile";

describe("profile", () => {
  test("is null until first saved", () => {
    expect(readProfile(openDatabase(":memory:"))).toBeNull();
  });

  test("save replaces the whole profile, trimming text and dropping blanks", () => {
    const db = openDatabase(":memory:");
    writeProfile(db, { name: "Ada", phone: "555" });
    writeProfile(db, { name: "  Ada Lovelace ", phone: "", citizenship: true });
    expect(readProfile(db)).toEqual({ name: "Ada Lovelace", citizenship: true });
  });

  test("rejects wrong types and leaves the stored profile alone", () => {
    const db = openDatabase(":memory:");
    writeProfile(db, { name: "Ada" });
    expect(() => writeProfile(db, { name: 42 })).toThrow("name must be a string");
    expect(() => writeProfile(db, { citizenship: "yes" })).toThrow("citizenship must be true or false");
    expect(() => writeProfile(db, [])).toThrow("Profile must be an object");
    expect(readProfile(db)).toEqual({ name: "Ada" });
  });

  test("ignores fields it does not know", () => {
    const db = openDatabase(":memory:");
    writeProfile(db, { name: "Ada", isAdmin: true });
    expect(readProfile(db)).toEqual({ name: "Ada" });
  });
});
