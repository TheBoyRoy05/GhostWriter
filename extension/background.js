const PAGES = ["experience", "education", "certifications", "skills", "projects"];

// Clean up legacy duplicate keys from older extension versions
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove(["scrapeSession", "scrapeSupabaseUrl", "scrapeSupabaseAnonKey"]);
});
chrome.storage.local.remove(["scrapeSession", "scrapeSupabaseUrl", "scrapeSupabaseAnonKey"]);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SESSION_CONNECTED") {
    chrome.storage.local.set({
      session: msg.session,
      supabaseUrl: msg.supabaseUrl,
      supabaseAnonKey: msg.supabaseAnonKey,
      linkedin: msg.linkedin,
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "SCRAPE_FAILED") {
    chrome.storage.local.remove("scrapeRequested");
    chrome.notifications.create({
      type: "basic",
      iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      title: "GhostWriter",
      message: "Scrape failed: " + (msg.error || "Unknown error"),
    });
    sendResponse({ ok: false });
    return true;
  }

  if (msg.type === "SCRAPE_COMPLETE") {
    handleScrapeResult(msg.data)
      .then((result) => {
        chrome.storage.local.remove("scrapeRequested");
        sendResponse(result);
        chrome.notifications.create({
          type: "basic",
          iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          title: "GhostWriter",
          message: "LinkedIn profile saved successfully.",
        });
        if (sender.tab?.id) chrome.tabs.remove(sender.tab.id);
      })
      .catch((err) => {
        sendResponse({ error: err.message });
        chrome.notifications.create({
          type: "basic",
          iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          title: "GhostWriter",
          message: "Scrape failed: " + err.message,
        });
      });
    return true;
  }

  if (msg.type === "START_SCRAPE") {
    startScrape(msg.session, msg.supabaseUrl, msg.supabaseAnonKey)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

async function startScrape(session) {
  const { linkedin: storedLinkedin } = await chrome.storage.local.get("linkedin");
  const fromSession = session?.user?.user_metadata?.linkedin;
  let linkedin = storedLinkedin?.trim() || fromSession?.trim();
  // Prefer session (profile) over stored value if stored is /me or invalid
  if (!linkedin || /linkedin\.com\/me\/?$/.test(linkedin)) {
    linkedin = fromSession?.trim();
  }
  if (!linkedin) {
    throw new Error("LinkedIn URL not found. Add it to your profile and connect the extension again.");
  }
  let linkedinUrl = linkedin.startsWith("http") ? linkedin : `https://${linkedin}`;
  if (/linkedin\.com\/me\/?$/.test(linkedinUrl)) {
    throw new Error(
      "Use your full profile URL (e.g. https://linkedin.com/in/yourname), not linkedin.com/me. Update it in your profile."
    );
  }
  linkedinUrl = linkedinUrl.replace(/\/?$/, "/");

  await chrome.storage.local.set({ scrapeRequested: true });

  await chrome.tabs.create({
    url: linkedinUrl,
    active: true,
  });
}

async function handleScrapeResult(data) {
  const { session, supabaseUrl, supabaseAnonKey } = await chrome.storage.local.get([
    "session",
    "supabaseUrl",
    "supabaseAnonKey",
  ]);
  if (!session?.access_token || !supabaseUrl || !supabaseAnonKey) {
    throw new Error("Session expired. Connect the extension again.");
  }
  const resume = {
    education: data.education || [],
    experiences: data.experiences || [],
    certifications: data.certifications || [],
    skills: data.skills || [],
    projects: data.projects || [],
  };

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({
      data: { resume },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || "Failed to save resume");
  }

  return { ok: true };
}
