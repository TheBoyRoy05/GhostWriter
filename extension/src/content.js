import { scrapeEducation } from "./pages/education.js";
import { scrapeExperience } from "./pages/experience.js";
import { scrapeProjects } from "./pages/projects.js";
import { scrapeCertifications } from "./pages/certifications.js";
import { scrapeSkills, scrapeSkillInsights, findInsightsLink, attachSkills, INSIGHTS_SCREEN } from "./pages/skills.js";

const STORAGE_KEY = "linkedinResumeData";

const PAGES = [
  { page: "education", key: "education", scrape: scrapeEducation },
  { page: "experience", key: "experiences", scrape: scrapeExperience },
  { page: "projects", key: "projects", scrape: scrapeProjects },
  { page: "certifications", key: "certifications", scrape: scrapeCertifications },
  { page: "skills", key: "skills", scrape: scrapeSkillsWithInsights },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCROLL_WAIT_MS = 800;
const STABLE_CHECKS = 3;
const MAX_SCROLLS = 40;
const CONTENT_TIMEOUT_MS = 10000;

// Rows mount as LazyColumn children once the last one nears view; the page scrolls inside main, not window.
const LAZY_COLUMN = '[data-component-type="LazyColumn"]';

function scrollParent(el) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement;
}

async function scrollUntilLoaded() {
  // The content script can run before LinkedIn renders the page body.
  const column = await waitFor(() => document.querySelector(`main ${LAZY_COLUMN}`), CONTENT_TIMEOUT_MS);
  if (!column) return console.warn("GhostWriter: no LazyColumn on this page, rows past the first batch may be missing");
  let lastRows = column.children.length;
  let stable = 0;
  for (let i = 0; i < MAX_SCROLLS && stable < STABLE_CHECKS; i++) {
    column.lastElementChild?.scrollIntoView({ block: "end" });
    const box = scrollParent(column);
    box.scrollTop = box.scrollHeight;
    await sleep(SCROLL_WAIT_MS);
    const rows = column.children.length;
    stable = rows === lastRows ? stable + 1 : 0;
    lastRows = rows;
  }
  scrollParent(column).scrollTop = 0;
  await sleep(500);
}

async function waitFor(check, timeoutMs) {
  for (let waited = 0; waited < timeoutMs; waited += POLL_MS) {
    const value = check();
    if (value) return value;
    await sleep(POLL_MS);
  }
  return check();
}

const POLL_MS = 200;
const DIALOG_TIMEOUT_MS = 10000;
// 18 back-to-back overlay loads drew a 429; space the insights fetches out.
const INSIGHTS_GAP_MS = 4000;

const insightsScreen = () => document.querySelector(INSIGHTS_SCREEN);

async function closeInsights() {
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
  if (await waitFor(() => !insightsScreen(), 3000)) return;
  history.back();
  if (!(await waitFor(() => !insightsScreen(), 3000))) throw new Error("Skill insights dialog would not close");
}

// The dialog only exists after its "Show all N details" link is clicked, so open it in place.
async function readInsights(link) {
  link.click();
  const readLabels = () => (insightsScreen() ? scrapeSkillInsights(insightsScreen()) : []);
  await waitFor(() => readLabels().length, DIALOG_TIMEOUT_MS);
  let labels = readLabels();
  for (let stable = 0; stable < STABLE_CHECKS; ) {
    await sleep(POLL_MS);
    const next = readLabels();
    stable = next.length === labels.length ? stable + 1 : 0;
    labels = next;
  }
  if (insightsScreen()) await closeInsights();
  return labels;
}

async function scrapeSkillsWithInsights() {
  const rows = scrapeSkills();
  const items = document.querySelectorAll('[data-testid^="profile_SkillDetails"] [componentkey^="com.linkedin.sdui.profile.skill("]');
  let opened = 0;
  for (const [i, row] of rows.entries()) {
    const link = findInsightsLink(items[i]);
    if (!link) continue;
    if (opened++) await sleep(INSIGHTS_GAP_MS);
    const labels = await readInsights(link);
    if (!labels.length) console.warn(`GhostWriter: ${row.name} insights dialog gave no entries`);
    row.usedIn = [...new Set([...row.usedIn, ...labels])];
  }
  return rows;
}

async function finish(stored) {
  const resume = attachSkills(Object.fromEntries(PAGES.map((p) => [p.key, stored[p.key] || []])));
  await chrome.storage.local.remove(STORAGE_KEY);
  chrome.runtime.sendMessage({ type: "SCRAPE_COMPLETE", data: resume });
}

function getBaseUrl() {
  const match = window.location.pathname.match(/^(\/in\/[^/]+)\/?/);
  return match ? window.location.origin + match[1].replace(/\/?$/, "/") : null;
}

function getCurrentPage() {
  const match = window.location.pathname.match(/\/details\/(\w+)/);
  if (!match) return null;
  return match[1] === "experiences" ? "experience" : match[1];
}

async function run() {
  const { scrapeRequested } = await chrome.storage.local.get("scrapeRequested");
  if (!scrapeRequested) return;

  const baseUrl = getBaseUrl();
  if (!baseUrl) return;

  const { [STORAGE_KEY]: stored = {} } = await chrome.storage.local.get(STORAGE_KEY);

  // A hard load of the insights URL means the dialog link navigated away; restarting would loop.
  if (window.location.pathname.includes("/skill-insights/")) return;

  const current = getCurrentPage();
  if (!current) {
    window.location.href = `${baseUrl}details/${PAGES[0].page}/`;
    return;
  }

  const pageIdx = PAGES.findIndex((p) => p.page === current);
  if (pageIdx === -1) return;
  const { key, scrape } = PAGES[pageIdx];

  await scrollUntilLoaded();
  const data = await scrape();

  chrome.runtime.sendMessage({ type: "PAGE_SCRAPED", page: current, entries: data.length });

  stored[key] = data;
  await chrome.storage.local.set({ [STORAGE_KEY]: stored });

  const next = PAGES[pageIdx + 1];
  if (next) window.location.href = `${baseUrl}details/${next.page}/`;
  else await finish(stored);
}

run().catch((e) => {
  console.error("GhostWriter scraper error:", e);
  chrome.runtime.sendMessage({ type: "SCRAPE_FAILED", error: e.message });
});
