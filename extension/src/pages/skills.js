const SKILL_ITEM = '[componentkey^="com.linkedin.sdui.profile.skill("]';
const ENDORSEMENTS = /^\d+ endorsements?$/;
// A skill tied to more than 3 entries collapses some into "3 experiences at Apple and 2 other companies".
const COLLAPSED_SUMMARY = 'a[aria-label="See Insights"]';
const SHOW_ALL = /^Show all \d+ details for /;
export const INSIGHTS_SCREEN = '[data-sdui-screen="com.linkedin.sdui.flagshipnav.profile.ProfileSkillAllInsights"]';

const texts = (els) => [...els].map((el) => el.textContent.trim()).filter(Boolean);

// Each skill row lists the entries it is attached to, by the same label LinkedIn shows on that entry.
export function scrapeSkills(doc = document) {
  const section = doc.querySelector('[data-testid^="profile_SkillDetails"]');
  if (!section) return [];
  return [...section.querySelectorAll(SKILL_ITEM)].map((item) => {
    const paragraphs = [...item.querySelectorAll("p")].filter((p) => !p.querySelector(COLLAPSED_SUMMARY));
    const [name, ...usedIn] = texts(paragraphs);
    return { name, usedIn: usedIn.filter((l) => !ENDORSEMENTS.test(l)) };
  });
}

// Truncated rows link to an insights dialog holding the full list. Its "N details" undercounts, so ignore N.
// A row can collapse entries into its summary line with no "Show all" link (Databases), so fall back to that link.
export function findInsightsLink(item) {
  const showAll = [...item.querySelectorAll("a[aria-label]")].find((a) => SHOW_ALL.test(a.getAttribute("aria-label")));
  return showAll ?? item.querySelector(COLLAPSED_SUMMARY);
}

export function scrapeSkillInsights(screen) {
  return texts(screen.querySelectorAll("p")).filter((l) => !ENDORSEMENTS.test(l));
}

const LABELS = {
  experiences: (e) => `${e.title} at ${e.company}`,
  projects: (e) => e.title,
  certifications: (e) => e.name,
  education: (e) => e.school,
};

export function attachSkills(resume) {
  const rows = resume.skills ?? [];
  for (const [key, label] of Object.entries(LABELS)) {
    for (const entry of resume[key] ?? []) {
      const joined = rows.filter((r) => r.usedIn.includes(label(entry))).map((r) => r.name);
      entry.skills = [...new Set([...entry.skills, ...joined])];
    }
  }
  return { ...resume, skills: [...new Set(rows.map((r) => r.name))] };
}
