import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { scrapeExperience } from "../src/pages/experience.js";
import { scrapeEducation } from "../src/pages/education.js";
import { scrapeProjects } from "../src/pages/projects.js";
import { scrapeCertifications } from "../src/pages/certifications.js";
import { scrapeSkills, scrapeSkillInsights, findInsightsLink, attachSkills, INSIGHTS_SCREEN } from "../src/pages/skills.js";
import { inlineSkills } from "../src/text.js";

const FIXTURES = new URL("../../data/fixtures/", import.meta.url);

async function fixture(name) {
  const file = Bun.file(new URL(name, FIXTURES));
  if (!(await file.exists())) return null;
  const doc = new Window({ url: "https://www.linkedin.com/in/someone/details/experience/" }).document;
  doc.body.innerHTML = await file.text();
  return doc;
}

// Fixtures hold real profile data, so they live in gitignored data/ and these tests skip without them.
const experienceDoc = await fixture("experience.html");
const educationDoc = await fixture("education.html");
const projectsDoc = await fixture("projects.html");
const certificationsDoc = await fixture("certifications.html");
const skillsDoc = await fixture("skills.html");
const insightsDoc = await fixture("skill-insights.html");

const editLinkCount = (doc) => doc.querySelectorAll('[componentkey^="entity-collection-item"] a[aria-label^="Edit "][href*="/edit/forms/"]').length;

function expectCleanSkills(entries) {
  for (const e of entries) {
    for (const s of e.skills) expect(s).not.toMatch(/\+\d+ skill|^Skills:/);
  }
}

describe.skipIf(!experienceDoc)("scrapeExperience on saved experience page", () => {
  const entries = experienceDoc ? scrapeExperience(experienceDoc) : [];

  test("returns one entry per position, including both roles under a grouped company", () => {
    expect(entries.length).toBe(experienceDoc.querySelectorAll('a[componentkey$="_edit"][componentkey*="_position_"]').length);
    expect(new Set(entries.map((e) => `${e.title} at ${e.company}`)).size).toBe(entries.length);
  });

  test("every entry has title, company and start date", () => {
    for (const e of entries) {
      expect(e.title).toBeTruthy();
      expect(e.company).toBeTruthy();
      expect(e.start).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
    }
  });

  test("company never carries the employment type suffix", () => {
    for (const e of entries) expect(e.company).not.toContain(" · ");
  });

  test("grouped roles take company and location from the group header", () => {
    const grouped = entries.filter((e, _, all) => all.filter((x) => x.company === e.company).length > 1);
    expect(grouped.length).toBeGreaterThan(1);
    for (const e of grouped) expect(e.location).toBe(grouped[0].location);
    for (const e of grouped) expect(e.location).toBeTruthy();
  });

  test("description splits on line breaks and strips bullet dashes", () => {
    const withBullets = entries.filter((e) => e.description.length > 1);
    expect(withBullets.length).toBeGreaterThan(0);
    for (const e of withBullets) for (const b of e.description) expect(b.startsWith("- ")).toBe(false);
  });

  test("media captions never leak into description or skills", () => {
    const captions = [...experienceDoc.querySelectorAll('a[href*="/treasury/"] p')].map((p) => p.textContent.trim());
    for (const e of entries) for (const c of captions) {
      expect(e.description).not.toContain(c);
      expect(e.skills).not.toContain(c);
    }
  });

  test("skills are clean", () => expectCleanSkills(entries));
});

describe.skipIf(!educationDoc)("scrapeEducation on saved education page", () => {
  const entries = educationDoc ? scrapeEducation(educationDoc) : [];

  test("returns one entry per school with school, degree and start date", () => {
    expect(entries.length).toBe(editLinkCount(educationDoc));
    for (const e of entries) {
      expect(e.school).toBeTruthy();
      expect(e.degree).toBeTruthy();
      expect(e.start).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
    }
  });

  test("grade drops its label and degree never holds the date line", () => {
    for (const e of entries) {
      if (e.grade) expect(e.grade.startsWith("Grade")).toBe(false);
      expect(e.degree).not.toMatch(/\d{4}/);
    }
  });

  test("skills are clean", () => expectCleanSkills(entries));
});

describe.skipIf(!projectsDoc)("scrapeProjects on saved projects page", () => {
  const entries = projectsDoc ? scrapeProjects(projectsDoc) : [];

  test("returns one entry per project, each with title, start and bullets", () => {
    expect(entries.length).toBe(editLinkCount(projectsDoc));
    for (const e of entries) {
      expect(e.title).toBeTruthy();
      expect(e.start).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
      expect(e.description.length).toBeGreaterThan(0);
    }
  });

  test("description never carries the title or the see-more toggle", () => {
    for (const e of entries) {
      expect(e.description).not.toContain(e.title);
      for (const b of e.description) expect(b).not.toMatch(/… more$/);
    }
  });

  test("links point off LinkedIn, and only projects with an external link have one", () => {
    const linked = entries.filter((e) => e.link);
    expect(linked.length).toBeGreaterThan(0);
    for (const e of linked) expect(new URL(e.link).hostname.endsWith("linkedin.com")).toBe(false);
  });

  test("associatedWith drops its label", () => {
    for (const e of entries.filter((x) => x.associatedWith)) expect(e.associatedWith.startsWith("Associated")).toBe(false);
  });

  test("skills are clean", () => expectCleanSkills(entries));
});

describe.skipIf(!certificationsDoc)("scrapeCertifications on saved certifications page", () => {
  const entries = certificationsDoc ? scrapeCertifications(certificationsDoc) : [];

  test("returns one entry per certification with name, issuer and issue date", () => {
    expect(entries.length).toBe(editLinkCount(certificationsDoc));
    for (const e of entries) {
      expect(e.name).toBeTruthy();
      expect(e.issuer).toBeTruthy();
      expect(e.issued).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
    }
  });

  test("credential links unwrap LinkedIn's safety redirect", () => {
    for (const e of entries.filter((x) => x.link)) expect(new URL(e.link).hostname.endsWith("linkedin.com")).toBe(false);
  });

  test("skills are clean", () => expectCleanSkills(entries));
});

describe.skipIf(!skillsDoc)("scrapeSkills on saved skills page", () => {
  test("returns every skill once, matching the edit buttons", () => {
    const names = scrapeSkills(skillsDoc).map((r) => r.name);
    expect(names.length).toBe(skillsDoc.querySelectorAll('a[aria-label^="Edit "][aria-label$=" skill"]').length);
    expect(new Set(names).size).toBe(names.length);
  });

  test("usedIn drops endorsement counts", () => {
    for (const r of scrapeSkills(skillsDoc)) for (const l of r.usedIn) expect(l).not.toMatch(/endorsement/);
  });

  test("truncated rows drop the collapsed summary line and expose their show-all link", () => {
    const items = skillsDoc.querySelectorAll('[data-testid^="profile_SkillDetails"] [componentkey^="com.linkedin.sdui.profile.skill("]');
    const rows = scrapeSkills(skillsDoc);
    const truncated = rows.filter((_, i) => findInsightsLink(items[i]));
    expect(truncated.map((r) => r.name).sort()).toEqual(["C++", "Databases", "Matplotlib", "Python", "React", "Statistics", "TypeScript", "UI/UX"]);
    for (const r of rows) for (const l of r.usedIn) expect(l).not.toMatch(/ other compan|^\d+ experiences? at /);
  });
});

describe.skipIf(!insightsDoc)("scrapeSkillInsights on saved insights dialog", () => {
  test("lists every entry the dialog promises, without endorsements", () => {
    const labels = scrapeSkillInsights(insightsDoc.querySelector(INSIGHTS_SCREEN));
    expect(labels.length).toBe(8);
    expect(labels).toContain("Software Engineer Intern at Apple");
    expect(labels).toContain("PyTorch Digit Recognizer");
    for (const l of labels) expect(l).not.toMatch(/endorsement/);
  });
});

describe("attachSkills", () => {
  test("adds each skill to every entry whose label it lists, keeping inline skills first", () => {
    const resume = attachSkills({
      experiences: [{ title: "Intern", company: "Acme", skills: ["Go"] }],
      projects: [{ title: "Rocket", skills: [] }],
      certifications: [{ name: "Cloud Cert", skills: [] }],
      education: [{ school: "State U", skills: [] }],
      skills: [
        { name: "Go", usedIn: ["Intern at Acme"] },
        { name: "C++", usedIn: ["Intern at Acme", "Rocket"] },
        { name: "AWS", usedIn: ["Cloud Cert", "State U"] },
        { name: "Communication", usedIn: [] },
      ],
    });
    expect(resume.experiences[0].skills).toEqual(["Go", "C++"]);
    expect(resume.projects[0].skills).toEqual(["C++"]);
    expect(resume.certifications[0].skills).toEqual(["AWS"]);
    expect(resume.education[0].skills).toEqual(["AWS"]);
    expect(resume.skills).toEqual(["Go", "C++", "AWS", "Communication"]);
  });
});

describe.skipIf(!skillsDoc || !experienceDoc || !projectsDoc)("attachSkills on saved pages", () => {
  test("every skill row tied to a scraped entry lands on that entry", () => {
    const rows = scrapeSkills(skillsDoc);
    const resume = attachSkills({ experiences: scrapeExperience(experienceDoc), projects: scrapeProjects(projectsDoc), skills: rows });
    const labelled = [
      ...resume.experiences.map((e) => [`${e.title} at ${e.company}`, e]),
      ...resume.projects.map((e) => [e.title, e]),
    ];
    let matched = 0;
    for (const row of rows) for (const label of row.usedIn) {
      const entry = labelled.find(([l]) => l === label)?.[1];
      if (entry) { matched++; expect(entry.skills).toContain(row.name); }
    }
    expect(matched).toBeGreaterThan(0);
  });
});

describe("inlineSkills", () => {
  test.each([
    ["Foosball and Python", ["Foosball", "Python"]],
    ["Skills: React, Databases, +5 skills", ["React", "Databases"]],
    ["Cassandra, C++ and +5 skills", ["Cassandra", "C++"]],
    ["Responsive Web Design, React, +1 skill", ["Responsive Web Design", "React"]],
    ["Python", ["Python"]],
    ["Skills: Research and Development, SQL", ["Research and Development", "SQL"]],
    ["", []],
  ])("%p", (text, skills) => {
    expect(inlineSkills(text)).toEqual(skills);
  });
});
