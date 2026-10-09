import { inlineSkills } from "../text.js";

export const ENTITY_ITEM = '[componentkey^="entity-collection-item"]';

export function paragraphs(el) {
  return [...(el?.querySelectorAll("p") ?? [])].map((p) => p.textContent.trim()).filter(Boolean);
}

export function entityItems(doc, sectionTestIdPrefix) {
  const section = doc.querySelector(`[data-testid^="${sectionTestIdPrefix}"]`);
  if (!section) return [];
  return [...section.querySelectorAll(ENTITY_ITEM)].flatMap((item) => {
    const id = item.querySelector('a[aria-label^="Edit "][href*="/edit/forms/"]')?.href.match(/\/edit\/forms\/(\d+)\//)?.[1];
    return id ? [{ item, id }] : [];
  });
}

export function entityHeader(item, id) {
  return item.querySelector(`a[href$="/edit/forms/${id}/"]:not([aria-label])`);
}

// Inline list may be cut short ("+5 skills"); attachSkills fills the rest from the skills page.
export function entitySkills(item, id) {
  const link = item.querySelector(`a[href*="/overlay/${id}/skill-associations-details/"]`);
  return inlineSkills(link?.textContent ?? "");
}
