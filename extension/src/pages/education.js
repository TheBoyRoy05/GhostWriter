import { DATE_RANGE, bullets, textWithBreaks } from "../text.js";
import { entityItems, entityHeader, entitySkills, paragraphs } from "./entity.js";

export function scrapeEducation(doc = document) {
  return entityItems(doc, "profile_EducationDetailsSection").map(({ item, id }) => {
    const [school = null, ...rest] = paragraphs(entityHeader(item, id));
    const dateLine = rest.find((l) => DATE_RANGE.test(l));
    const dates = dateLine?.match(DATE_RANGE);
    const grade = paragraphs(item).find((l) => l.startsWith("Grade:"))?.replace(/^Grade:\s*/, "") ?? null;
    const box = item.querySelector('[data-testid="expandable-text-box"]');
    return {
      school,
      degree: rest.find((l) => l !== dateLine) ?? null,
      start: dates?.[1] ?? null,
      end: dates?.[2] ?? null,
      grade,
      description: box ? bullets(textWithBreaks(box)) : [],
      skills: entitySkills(item, id),
    };
  });
}
