import { POSITION_DATES, DATE_RANGE, bullets, textWithBreaks } from "../text.js";
import { ENTITY_ITEM, entitySkills, paragraphs as lines } from "./entity.js";

const EMPLOYMENT = ["Internship", "Part-time", "Full-time", "Contract", "Freelance", "Self-employed", "Apprenticeship", "Seasonal"];
const EDIT_BUTTON = 'a[componentkey*="_position_"][componentkey$="_edit"]';
const SECTION = '[data-testid^="profile_ExperienceDetailsSection"]';

function splitDot(line) {
  const [head, ...rest] = line.split(" · ");
  return [head.trim(), rest.join(" · ").trim() || null];
}

function groupHeader(positionRoot) {
  const group = positionRoot.closest(ENTITY_ITEM);
  const header = group?.querySelector('a[href*="/company/"] p')?.closest("a");
  const [company, , location] = lines(header);
  return { company: company ?? null, location: location ?? null };
}

function parsePosition(editButton) {
  const id = editButton.getAttribute("componentkey").match(/_position_(\d+)_edit$/)[1];
  const root = editButton.closest("li") ?? editButton.closest(ENTITY_ITEM);
  const header = root.querySelector(`a[href$="/edit/forms/${id}/"]:not([aria-label])`);
  const headerLines = lines(header);
  const dateIdx = headerLines.findIndex((l) => POSITION_DATES.test(l));

  const title = headerLines[0] ?? null;
  const middle = dateIdx > 1 ? headerLines[1] : null;
  const after = dateIdx >= 0 ? headerLines[dateIdx + 1] ?? null : null;

  const [companyLine, typeLine] = middle ? splitDot(middle) : [null, null];
  const employmentType = EMPLOYMENT.includes(typeLine) ? typeLine : null;
  const [location, workplaceType] = after ? splitDot(after) : [null, null];

  const label = editButton.getAttribute("aria-label") ?? "";
  const labelPrefix = `Edit ${title} at `;
  const group = middle ? null : groupHeader(root);
  const company = label.startsWith(labelPrefix) ? label.slice(labelPrefix.length) : companyLine ?? group?.company ?? null;

  const dates = dateIdx >= 0 ? headerLines[dateIdx].match(DATE_RANGE) : null;
  const descriptionBox = root.querySelector('[data-testid="expandable-text-box"]');

  return {
    id,
    company,
    title,
    employmentType,
    location: location ?? group?.location ?? null,
    workplaceType,
    start: dates?.[1] ?? null,
    end: dates?.[2] ?? null,
    description: descriptionBox ? bullets(textWithBreaks(descriptionBox)) : [],
    skills: entitySkills(root, id),
  };
}

export function scrapeExperience(doc = document) {
  const section = doc.querySelector(SECTION);
  if (!section) return [];
  return [...section.querySelectorAll(EDIT_BUTTON)].map(parsePosition);
}
