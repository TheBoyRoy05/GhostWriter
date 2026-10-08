const SERVER = "http://127.0.0.1:3000";

async function post(path, method, body) {
  const res = await fetch(SERVER + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
}

async function startScrape(linkedinUrl) {
  if (!/linkedin\.com\/in\/[^/]+/.test(linkedinUrl)) {
    throw new Error("Use your full profile URL, e.g. https://www.linkedin.com/in/yourname");
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
  await chrome.tabs.create({ url: SERVER });
}

const handlers = {
  START_SCRAPE: (msg) => startScrape(msg.linkedin),
  SEND_JOB: () => sendJob(),
  SCRAPE_COMPLETE: async (msg, sender) => {
    await chrome.storage.local.remove("scrapeRequested");
    await post("/api/resume", "PUT", msg.data);
    if (sender.tab?.id) chrome.tabs.remove(sender.tab.id);
  },
  SCRAPE_FAILED: () => chrome.storage.local.remove("scrapeRequested"),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg.type];
  if (!handler) return;
  Promise.resolve(handler(msg, sender))
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ error: err.message }));
  return true;
});
