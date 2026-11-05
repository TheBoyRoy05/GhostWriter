import { expect, test } from "bun:test";
import { localDay, shortDate, slugOf } from "@/lib/format";

test("slugOf lowercases and hyphenates every space", () => {
  expect(slugOf("Not sent yet")).toBe("not-sent-yet");
});

test("localDay uses the local calendar date", () => {
  expect(localDay(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
});

test("shortDate keeps a bare date on its own day in every time zone", () => {
  const expected = new Date(2026, 10, 2).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  expect(shortDate("2026-11-02")).toBe(expected);
});

test("shortDate returns text it cannot parse unchanged", () => {
  expect(shortDate("ASAP")).toBe("ASAP");
});
