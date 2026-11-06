import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLatexFromMatcherResult, compileLatex, escapeLatex } from "./latex";

const SPECIALS = "\\ ^ ~ & % # $ _ { } < > |";
const dirs: string[] = [];
const tempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "ghostwriter-latex-test-"));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("escapeLatex", () => {
  test("turns each special character into its text command in one pass", () => {
    expect(escapeLatex("a\\b^c~d{e}")).toBe("a\\textbackslash{}b\\textasciicircum{}c\\textasciitilde{}d\\{e\\}");
    expect(escapeLatex("&%#$_")).toBe("\\&\\%\\#\\$\\_");
  });
});

describe("compileLatex", () => {
  test("reads the page count of a two-page document from the Tectonic log", async () => {
    const latex = "\\documentclass{article}\\begin{document}one\\newpage two\\end{document}";
    expect(await compileLatex(await tempDir(), latex)).toBe(2);
  }, 60_000);

  test("compiles a resume with every LaTeX special character in every text field", async () => {
    const result = {
      experiences: [{ company: `Co ${SPECIALS}`, title: SPECIALS, start: SPECIALS, end: SPECIALS, description: [`Cut ${SPECIALS} costs`] }],
      projects: [{ title: SPECIALS, skills: [SPECIALS], start: SPECIALS, description: [SPECIALS] }],
      languages: [SPECIALS],
      tools: [SPECIALS],
      domain: [SPECIALS],
      certifications: [SPECIALS],
    };
    const profile = { name: `Ann ${SPECIALS}`, location: `Austin & Remote ${SPECIALS}`, hobbies: SPECIALS, phone: SPECIALS, citizenship: true };
    const resume = { education: [{ school: SPECIALS, degree: SPECIALS, end: SPECIALS, grade: SPECIALS }] };
    const dir = await tempDir();

    const pages = await compileLatex(dir, buildLatexFromMatcherResult(result, profile, resume, SPECIALS));

    expect(pages).toBe(1);
    expect(await Bun.file(join(dir, "resume.pdf")).exists()).toBe(true);
  }, 60_000);

  test("compiles a resume with no projects by leaving the section out", async () => {
    const latex = buildLatexFromMatcherResult({ experiences: [{ company: "Co", title: "SDE", description: ["Shipped it"] }] }, { name: "Ann" });

    expect(latex).not.toContain("Projects");
    expect(await compileLatex(await tempDir(), latex)).toBe(1);
  }, 60_000);

  test("fails with Tectonic's stderr when the LaTeX does not compile", async () => {
    await expect(compileLatex(await tempDir(), "\\documentclass{article}\\begin{document}\\undefinedcommand\\end{document}")).rejects.toThrow(
      "Undefined control sequence",
    );
  }, 60_000);

  test("kills Tectonic at the timeout and says so", async () => {
    // A real compile takes over 100 ms, so 10 ms always hits the timeout.
    const latex = "\\documentclass{article}\\begin{document}one\\end{document}";
    await expect(compileLatex(await tempDir(), latex, 10)).rejects.toThrow("Tectonic timed out after 0.01 s");
  });
});
