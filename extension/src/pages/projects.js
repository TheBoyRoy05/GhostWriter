import { DATE_RANGE, bullets, textWithBreaks } from "../text.js";
import { entityItems, entityHeader, entitySkills, paragraphs } from "./entity.js";

const ASSOCIATED = /^Associated with (.+)$/;

export function scrapeProjects(doc = document) {
  return entityItems(doc, "profile_ProjectsDetails").map(({ item, id }) => {
    const header = entityHeader(item, id);
    const [title = null, ...rest] = paragraphs(header);
    const dates = rest.find((l) => DATE_RANGE.test(l))?.match(DATE_RANGE);
    const box = [...item.querySelectorAll('[data-testid="expandable-text-box"]')].find((b) => !header?.contains(b));
    const link = [...item.querySelectorAll("a[href^='http']")].find((a) => !new URL(a.href).hostname.endsWith("linkedin.com"));
    const associated = paragraphs(item).map((l) => l.match(ASSOCIATED)).find(Boolean);
    return {
      title,
      link: link?.href ?? null,
      associatedWith: associated?.[1] ?? null,
      start: dates?.[1] ?? null,
      end: dates?.[2] ?? null,
      description: box ? bullets(textWithBreaks(box)) : [],
      skills: entitySkills(item, id),
    };
  });
}
