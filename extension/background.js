const SERVER = "http://127.0.0.1:3000";
const APP = "http://127.0.0.1:5173";

async function post(path, method, body) {
  let res;
  try {
    res = await fetch(SERVER + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Can't reach the GhostWriter server at ${SERVER}. Run \`bun dev\` in the repo.`);
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${method} ${path} returned ${res.status}: ${detail || res.statusText}`);
  }
}

const LINKEDIN_USERNAME = /^[\w-]+$/;

function toProfileUrl(input) {
  const value = input.trim().replace(/^@/, "");
  return LINKEDIN_USERNAME.test(value) ? `https://www.linkedin.com/in/${value}` : value;
}

async function startScrape(input) {
  const linkedinUrl = toProfileUrl(input);
  if (!/linkedin\.com\/in\/[^/]+/.test(linkedinUrl)) {
    throw new Error("Use your username or profile URL, e.g. yourname or https://www.linkedin.com/in/yourname");
  }
  await chrome.storage.local.set({ linkedin: linkedinUrl, scrapeRequested: true });
  await chrome.tabs.create({ url: linkedinUrl.replace(/\/?$/, "/"), active: true });
}

async function sendJob() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.body.innerText,
  });
  await post("/api/job", "POST", { text: `${tab.url}\n\n${result}` });
  await focusApp();
}

function waitForLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id !== tabId || info.status !== "complete") return;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function focusApp() {
  const [existing] = await chrome.tabs.query({ url: `${APP}/*` });
  if (existing) {
    await chrome.windows.update(existing.windowId, { focused: true });
    return chrome.tabs.update(existing.id, { active: true });
  }
  const tab = await chrome.tabs.create({ url: APP });
  await waitForLoad(tab.id);
  return tab;
}

async function finishScrape(scrapeTab, message) {
  await chrome.storage.local.remove("scrapeRequested");
  if (scrapeTab?.id) await chrome.tabs.remove(scrapeTab.id);
  const app = await focusApp();
  await chrome.scripting.executeScript({
    target: { tabId: app.id },
    func: (text) => alert(text),
    args: [message],
  });
}

async function saveScrape(resume, scrapeTab) {
  try {
    await post("/api/resume", "PUT", resume);
  } catch (err) {
    return finishScrape(scrapeTab, `GhostWriter: Scrape failed - ${err.message}`);
  }
  return finishScrape(scrapeTab, "GhostWriter: LinkedIn profile saved.");
}

const handlers = {
  START_SCRAPE: (msg) => startScrape(msg.linkedin),
  SEND_JOB: () => sendJob(),
  PAGE_SCRAPED: (msg) => console.log(`[scrape] ${msg.page}: ${msg.entries} entries${msg.spans === undefined ? "" : `, ${msg.spans} spans`}`),
  SCRAPE_COMPLETE: (msg, sender) => saveScrape(msg.data, sender.tab),
  SCRAPE_FAILED: (msg, sender) => finishScrape(sender.tab, `GhostWriter: Scrape failed - ${msg.error}`),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg.type];
  if (!handler) return;
  Promise.resolve(handler(msg, sender))
    .then(() => sendResponse({ ok: true }))
    .catch((err) => {
      console.error(`[${msg.type}]`, err);
      sendResponse({ error: err.message });
    });
  return true;
});
