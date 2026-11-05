import { describe, expect, test } from "bun:test";
import { pageJob, pastedJob } from "../src/job.js";

const url = "https://example.com/jobs/1";
const posting = { "@context": "https://schema.org", "@type": "JobPosting", title: "Software Engineer" };
const organization = { "@type": "Organization", name: "Acme" };

function postingOf(...ldJsonScripts) {
  return pageJob(url, "Senior Engineer", ldJsonScripts).jobPosting;
}

describe("pageJob", () => {
  test("puts the page URL on the first line, then a blank line, then the page text", () => {
    expect(pageJob(url, "Senior Engineer", [])).toEqual({ text: `${url}\n\nSenior Engineer`, jobPosting: null });
  });

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
