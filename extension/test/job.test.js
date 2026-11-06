import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { findJobPosting, pageJob, pastedJob, textFromHtml } from "../src/job.js";

const url = "https://example.com/jobs/1";
const posting = { "@context": "https://schema.org", "@type": "JobPosting", title: "Software Engineer" };
const organization = { "@type": "Organization", name: "Acme" };

// textFromHtml runs in the job tab, so the tests give it a browser's globals.
const window = new Window();
globalThis.DOMParser = window.DOMParser;
globalThis.NodeFilter = window.NodeFilter;

const postingOf = (...ldJsonScripts) => findJobPosting(ldJsonScripts);

describe("pageJob", () => {
  test("puts the page URL on the first line, then the page text, and reports the fallback", () => {
    expect(pageJob(url, "Senior Engineer", null, "")).toEqual({ job: { text: `${url}\n\nSenior Engineer`, jobPosting: null }, fromPageText: true });
  });

  test("uses the description instead of the page text", () => {
    expect(pageJob(url, "Page text", posting, "Build things.")).toEqual({ job: { text: `${url}\n\nBuild things.`, jobPosting: posting }, fromPageText: false });
  });
});

describe("textFromHtml", () => {
  test("keeps paragraph and list breaks and decodes entities", () => {
    const html = "<p>We&rsquo;re building <b>tools</b>.</p>\n<h2>You have</h2>\n<ul>\n  <li>Go &amp; Rust</li>\n  <li>5+ years</li>\n</ul>";
    expect(textFromHtml(html)).toBe("We’re building tools.\n\nYou have\n\n- Go & Rust\n- 5+ years");
  });

  test("reads entity-escaped HTML as HTML", () => {
    expect(textFromHtml("&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;ul&gt;&lt;li&gt;A&lt;/li&gt;&lt;/ul&gt;")).toBe("Hello & welcome\n\n- A");
  });

  test("drops script and style bodies", () => {
    expect(textFromHtml("<style>.x{color:red}</style><p>Hi</p><script>track()</script>")).toBe("Hi");
  });

  test("keeps the line breaks of a plain-text description", () => {
    expect(textFromHtml("Line one\nLine two &amp; more\n")).toBe("Line one\nLine two & more");
  });

  test("breaks before a list or paragraph that follows inline text", () => {
    expect(textFromHtml("<strong>Requirements:</strong><ul><li>Go</li></ul>")).toBe("Requirements:\n\n- Go");
    expect(textFromHtml("<div>Intro<p>Para</p></div>")).toBe("Intro\n\nPara");
  });

  test("indents nested list items and keeps paragraphs in items on the bullet line", () => {
    expect(textFromHtml("<ul><li>A<ul><li>B</li></ul></li><li>C</li></ul><p>After</p>")).toBe("- A\n  - B\n- C\n\nAfter");
    expect(textFromHtml("<ul><li><p>A</p></li><li><p>B</p></li></ul>")).toBe("- A\n- B");
  });

  test("separates table cells", () => {
    expect(textFromHtml("<table><tr><td>Salary</td><td>100k</td></tr></table>")).toBe("Salary 100k");
  });

  test("is empty for an empty paragraph, so Apply falls back to the page text", () => {
    expect(textFromHtml("  <p> </p> ")).toBe("");
  });
});

describe("findJobPosting", () => {

  test("returns a JobPosting script's object", () => {
    expect(postingOf(JSON.stringify(posting))).toEqual(posting);
  });

  test("finds the JobPosting inside a top-level array", () => {
    expect(postingOf(JSON.stringify([organization, posting]))).toEqual(posting);
  });

  test("finds the JobPosting inside @graph", () => {
    expect(postingOf(JSON.stringify({ "@context": "https://schema.org", "@graph": [organization, posting] }))).toEqual(posting);
  });

  test("matches an @type given as an array", () => {
    const multiType = { ...posting, "@type": ["JobPosting", "Thing"] };
    expect(postingOf(JSON.stringify(multiType))).toEqual(multiType);
  });

  test("matches a prefixed or full-IRI @type", () => {
    for (const type of ["schema:JobPosting", "https://schema.org/JobPosting"]) {
      const typed = { ...posting, "@type": type };
      expect(postingOf(JSON.stringify(typed))).toEqual(typed);
    }
  });

  test("does not match a type that only ends in JobPosting", () => {
    expect(postingOf(JSON.stringify({ ...posting, "@type": "NotAJobPosting" }))).toBeNull();
  });

  test("returns null when no script holds a JobPosting", () => {
    expect(postingOf(JSON.stringify(organization))).toBeNull();
  });

  test("skips malformed JSON and keeps looking in later scripts", () => {
    expect(postingOf("{ not json", JSON.stringify(posting))).toEqual(posting);
    expect(postingOf("{ not json")).toBeNull();
  });
});

describe("pastedJob", () => {
  test("puts the link on the first line and sends no posting", () => {
    expect(pastedJob("Senior Engineer", url)).toEqual({ text: `${url}\n\nSenior Engineer`, jobPosting: null });
  });

  test("is just the description when there is no link", () => {
    expect(pastedJob("Senior Engineer", "")).toEqual({ text: "Senior Engineer", jobPosting: null });
  });

  test("rejects an empty description", () => {
    expect(() => pastedJob("", url)).toThrow("Paste a job description first.");
  });

  test("rejects a link that is not an http or https URL", () => {
    for (const link of ["acme.com/jobs/1", "ftp://acme.com/jobs/1"]) {
      expect(() => pastedJob("Senior Engineer", link)).toThrow("Use a full job link");
    }
  });
});
