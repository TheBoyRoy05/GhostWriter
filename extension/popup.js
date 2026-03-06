// Default frontend URL - change for production
const DEFAULT_FRONTEND_URL = "http://localhost:8080/GhostWriter";

async function getFrontendUrl() {
  const { frontendUrl } = await chrome.storage.local.get("frontendUrl");
  return frontendUrl || DEFAULT_FRONTEND_URL;
}

async function checkAuth() {
  const { session } = await chrome.storage.local.get("session");
  return !!session?.access_token;
}

async function init() {
  const signInBtn = document.getElementById("signIn");
  const scrapeBtn = document.getElementById("scrape");
  const authStatus = document.getElementById("authStatus");

  const isAuthed = await checkAuth();
  const helpEl = document.getElementById("help");
  if (isAuthed) {
    authStatus.textContent = "Connected";
    signInBtn.textContent = "Reconnect";
    scrapeBtn.disabled = false;
    helpEl.style.display = "none";
  } else {
    authStatus.textContent = "Not connected.";
    scrapeBtn.disabled = true;
    helpEl.style.display = "block";
  }
  signInBtn.disabled = false;

  signInBtn.onclick = async () => {
    const url = await getFrontendUrl();
    chrome.tabs.create({ url: url + (url.endsWith("/") ? "" : "/") + "profile" });
    window.close();
  };

  document.getElementById("refresh").onclick = () => init();

  scrapeBtn.onclick = async () => {
    scrapeBtn.disabled = true;
    const statusEl = document.getElementById("status");
    statusEl.className = "status info";
    statusEl.textContent = "Opening LinkedIn...";

    const { session, supabaseUrl, supabaseAnonKey } = await chrome.storage.local.get([
      "session",
      "supabaseUrl",
      "supabaseAnonKey",
    ]);

    if (!session?.access_token || !supabaseUrl || !supabaseAnonKey) {
      statusEl.className = "status error";
      statusEl.textContent = "Not connected. Sign in and click Connect Extension on your profile.";
      scrapeBtn.disabled = false;
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: "START_SCRAPE",
        session,
        supabaseUrl,
        supabaseAnonKey,
      },
      (response) => {
        if (response?.error) {
          statusEl.className = "status error";
          statusEl.textContent = response.error;
          scrapeBtn.disabled = false;
        } else {
          statusEl.className = "status info";
          statusEl.textContent = "Scraping... Check the LinkedIn tab. This may take 1-2 minutes.";
          window.close();
        }
      }
    );
  };
}

init();
