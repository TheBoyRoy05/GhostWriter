import { describe, expect, test } from "bun:test";
import { progressOf } from "./NewApplication";

const loaded = { state: "loaded" } as const;

describe("progressOf", () => {
  test("shows the generate warning when the written resume runs over one page", () => {
    const resume = { job: "posting", state: "written", latex: "", warning: "Resume is 2 pages: no bullet can drop without breaking the item limits" } as const;
    expect(progressOf(loaded, "posting", resume)).toEqual({
      text: "Resume is 2 pages: no bullet can drop without breaking the item limits. Confirm to open it.",
      error: true,
    });
  });

  test("reports a one-page resume as written", () => {
    expect(progressOf(loaded, "posting", { job: "posting", state: "written", latex: "" })).toEqual({ text: "Resume written. Confirm to open it." });
  });
});
