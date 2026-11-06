// fromPageText marks a page with no JSON-LD description, whose text may include nav and other listings.
export function pageJob(url, pageText, jobPosting, descriptionText) {
  return { job: { text: jobText(url, descriptionText || pageText), jobPosting }, fromPageText: !descriptionText };
}

export function pastedJob(description, link) {
  if (!description) throw new Error("Paste a job description first.");
  if (link && !isWebUrl(link)) throw new Error("Use a full job link starting with https://, or leave it empty.");
  return { text: jobText(link, description), jobPosting: null };
}

export function findJobPosting(ldJsonScripts) {
  for (const script of ldJsonScripts) {
    let data;
    try {
      data = JSON.parse(script);
    } catch {
      continue;
    }
    const posting = jobPostingIn(data);
    if (posting) return posting;
  }
  return null;
}

// Runs inside the job tab, since the service worker has no DOMParser, so it must not use anything outside itself.
export function textFromHtml(html) {
  const parse = (source) => new DOMParser().parseFromString(source, "text/html").body;
  let body = parse(html);
  // Some sites (e.g. Greenhouse) entity-escape the HTML, so the first parse yields the tags as text.
  if (!body.children.length && /<[a-z]/i.test(body.textContent)) body = parse(body.textContent);
  if (!body.children.length) return body.textContent.trim();

  body.querySelectorAll("script, style").forEach((element) => element.remove());
  const walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) walker.currentNode.data = walker.currentNode.data.replace(/\s+/g, " ");

  // Blocks inside a list item stay on its line, so a list stays tight and a nested list indents under its parent.
  body.querySelectorAll("p, div, h1, h2, h3, h4, h5, h6, ul, ol, tr, table, section, blockquote").forEach((block) => {
    if (block.closest("li")) return;
    block.before("\n\n");
    block.after("\n\n");
  });
  body.querySelectorAll("li").forEach((item) => {
    let depth = 0;
    for (let parent = item.parentElement.closest("li"); parent; parent = parent.parentElement.closest("li")) depth++;
    item.prepend(`${"  ".repeat(depth)}- `);
    item.before("\n");
  });
  body.querySelectorAll("br").forEach((lineBreak) => lineBreak.after("\n"));
  body.querySelectorAll("td, th").forEach((cell) => cell.after(" "));
  return body.textContent
    .replace(/ +\n/g, "\n")
    .replace(/^ +(?! *- )/gm, "")
    .replace(/^( *- ) +/gm, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// The app reads the first line as the job's link (web/src/NewApplication.tsx linkOf).
function jobText(link, body) {
  return link ? `${link}\n\n${body}` : body;
}

function isWebUrl(link) {
  const url = URL.parse(link);
  return url?.protocol === "http:" || url?.protocol === "https:";
}

function jobPostingIn(data) {
  if (Array.isArray(data)) {
    for (const item of data) {
      const posting = jobPostingIn(item);
      if (posting) return posting;
    }
    return null;
  }
  if (!data || typeof data !== "object") return null;
  if ([data["@type"]].flat().some(isJobPostingType)) return data;
  return data["@graph"] ? jobPostingIn(data["@graph"]) : null;
}

// Pages also write the type as "schema:JobPosting" or "https://schema.org/JobPosting".
function isJobPostingType(type) {
  return typeof type === "string" && type.split(/[/:]/).at(-1) === "JobPosting";
}
