const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";

export const POSITION_DATES = new RegExp(`^${MONTH} \\d{4} (?:[-–]|to) (?:Present|${MONTH} \\d{4})(?: · .+)?$`);
export const DATE_RANGE = new RegExp(`^(${MONTH} \\d{4}) (?:[-–]|to) (Present|${MONTH} \\d{4})`);

export function bullets(text) {
  return text.split("\n").filter((l) => l.trim()).map((l) => (l.startsWith("- ") ? l.slice(2).trim() : l.trim()));
}

// The "… more" toggle sits inside the text box; the full text is already in the DOM.
export function textWithBreaks(el) {
  const copy = el.cloneNode(true);
  copy.querySelectorAll("button").forEach((b) => b.remove());
  copy.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  return copy.textContent;
}

// LinkedIn writes inline skills two ways: "Skills: A, B, +5 skills" (comma only),
// or unlabeled "A, B and C" / "A, B and +5 skills".
export function inlineSkills(text) {
  const labeled = /^\s*Skills:/.test(text);
  const list = text.replace(/^\s*Skills:/, "").trim();
  if (!list) return [];
  const parts = list.split(", ");
  const last = parts.pop();
  const andAt = labeled ? -1 : last.lastIndexOf(" and ");
  if (andAt >= 0) parts.push(last.slice(0, andAt), last.slice(andAt + 5));
  else parts.push(last);
  return parts.map((s) => s.trim()).filter((s) => s && !/^\+\d+ skills?$/.test(s));
}
