const PAGES = ["education", "experience", "projects", "certifications", "skills"];
const STORAGE_KEY = "linkedinResumeData";

async function waitAndScroll(pageKey) {
  const scrollCount = pageKey === "skills" ? 5 : 3;
  for (let i = 0; i < scrollCount; i++) {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 800));
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 500));
}

function getBaseUrl() {
  const match = window.location.pathname.match(/^(\/in\/[^/]+)\/?/);
  return match ? window.location.origin + match[1].replace(/\/?$/, "/") : null;
}

function getCurrentPage() {
  const match = window.location.pathname.match(/\/details\/(\w+)/);
  return match ? match[1] : null;
}

function scrapeExperience() {
  const POSITION_DATES = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} (?:-|to) (?:Present|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4})(?: · .+)?$/;
  const DATE_RANGE = /^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}) (?:-|to) (Present|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4})/;
  const EMPLOYMENT = ["Internship", "Part-time", "Full-time", "Contract", "Freelance"];

  function bullets(text) {
    return text.split("\n").filter((l) => l.trim()).map((l) => (l.startsWith("- ") ? l.slice(2).trim() : l.trim()));
  }
  function skills(text) {
    if (!text.includes("Skills:")) return [];
    return (text.split("Skills:", 2)[1] || "").trim().split(" · ").map((s) => s.trim()).filter(Boolean);
  }
  function isLocation(s) {
    return s.includes(", United States") || s.endsWith("United States");
  }

  const items = [...document.querySelectorAll("main section span[aria-hidden]")].map((s) => s.innerText);
  const exps = [];
  let company = items[0] || null;
  let i = 0;

  while (i < items.length) {
    const item = items[i];
    if (POSITION_DATES.test(item) && i > 0) {
      const prev = items[i - 1];
      let title, companyName;
      if (prev.includes(" · ") && EMPLOYMENT.some((t) => prev.includes(t))) {
        title = i >= 2 ? items[i - 2] : prev;
        companyName = prev.split(" · ")[0].trim();
        company = companyName;
      } else {
        title = prev;
        companyName = company;
      }
      const dates = item.match(DATE_RANGE);
      const [start, end] = dates ? [dates[1], dates[2]] : [null, null];
      let desc = null;
      let skillList = [];
      i++;
      while (i < items.length) {
        const nxt = items[i];
        if (nxt.startsWith("Skills:")) {
          skillList = skills(nxt);
          i++;
          break;
        }
        if (POSITION_DATES.test(nxt)) break;
        if (!isLocation(nxt)) desc = nxt;
        i++;
      }
      exps.push({ company: companyName, title, start, end, description: desc ? bullets(desc) : [], skills: skillList });
      continue;
    }
    i++;
  }
  return exps;
}

function scrapeEducation() {
  const DATE_RANGE = /^([A-Za-z]{3} \d{4}) (?:-|to) ([A-Za-z]{3} \d{4})$/;
  const GRADE = /^Grade:\s*(.+)$/;
  const items = [...document.querySelectorAll("main section span[aria-hidden]")].map((s) => s.innerText);
  const entries = [];
  let i = 0;
  while (i < items.length) {
    const m = items[i].match(DATE_RANGE);
    if (!m || i < 2) {
      i++;
      continue;
    }
    const [_, start, end] = m;
    const degree = items[i - 1].trim();
    const school = items[i - 2].trim();
    let grade = null;
    if (i + 1 < items.length && items[i + 1].startsWith("Grade:")) {
      const gradeMatch = items[i + 1].match(GRADE);
      grade = gradeMatch ? gradeMatch[1].trim() : items[i + 1].replace("Grade:", "", 1).trim();
      i++;
    }
    entries.push({ school, degree, start, end, grade });
    i++;
  }
  return entries;
}

function scrapeCertifications() {
  const ISSUED = /^Issued (.+?)(?: · Expires (.+))?$/;
  function skills(text) {
    if (!text.includes("Skills:")) return [];
    return (text.split("Skills:", 2)[1] || "").trim().split(" · ").map((s) => s.trim()).filter(Boolean);
  }
  const links = [...document.querySelectorAll("main section a[href]")].filter((a) =>
    a.textContent.trim().includes("Show credential")
  ).map((a) => a.href || "");
  const items = [...document.querySelectorAll("main section span[aria-hidden]")].map((s) => s.innerText);
  const certs = [];
  let linkIdx = 0;
  let i = 0;
  while (i < items.length) {
    if (!items[i].startsWith("Skills:")) {
      i++;
      continue;
    }
    const skillList = skills(items[i]);
    let credentialId = null, issued = null, expires = null;
    let j = i - 1;
    if (j >= 0 && items[j].startsWith("Credential ID ")) {
      credentialId = items[j].replace("Credential ID ", "", 1).trim();
      j--;
    }
    if (j >= 0 && items[j].startsWith("Issued ")) {
      const issuedMatch = items[j].match(ISSUED);
      if (issuedMatch) {
        issued = issuedMatch[1].trim();
        expires = issuedMatch[2] ? issuedMatch[2].trim() : null;
      }
      j--;
    }
    const issuer = j >= 0 ? items[j].trim() : null;
    j--;
    const name = j >= 0 ? items[j].trim() : null;
    const link = links[linkIdx] ?? null;
    linkIdx++;
    certs.push({ name, issuer, issued, expires, credential_id: credentialId, skills: skillList, link });
    i++;
  }
  return certs;
}

function scrapeSkills() {
  return [...new Set(
    [...document.querySelectorAll("main section a span[aria-hidden]")]
      .map((s) => s.innerText.trim())
      .filter((text) => !text.toLowerCase().includes("endorse") && !text.toLowerCase().includes("experiences"))
  )];
}

async function scrapeProjects() {
  const POSITION_DATES = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} (?:-|to) (?:Present|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4})(?: · .+)?$/;
  const DATE_RANGE = /^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}) (?:-|to) (Present|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4})/;

  function bullets(text) {
    return text.split("\n").filter((l) => l.trim()).map((l) => (l.startsWith("- ") ? l.slice(2).trim() : l.trim()));
  }
  function skills(text) {
    if (!text.includes("Skills:")) return [];
    return (text.split("Skills:", 2)[1] || "").trim().split(" · ").map((s) => s.trim()).filter(Boolean);
  }

  const modalTriggers = [...document.querySelectorAll("main section li > a[href]")];
  const projectOrder = [];
  const projectIdToUrl = {};
  const seenIds = new Set();

  for (const trigger of modalTriggers) {
    const href = trigger.href;
    const projectIdMatch = href.match(/\/projects\/(\d+)\//);
    const projectId = projectIdMatch ? projectIdMatch[1] : null;
    const isLink = href.includes("type=LINK");

    if (projectId && !seenIds.has(projectId)) {
      seenIds.add(projectId);
      projectOrder.push(projectId);
    }

    if (projectId && isLink && !projectIdToUrl[projectId]) {
      trigger.click();
      await new Promise((r) => setTimeout(r, 800));
      const modal = document.querySelector('[role="dialog"]') || document.querySelector('[aria-modal="true"]');
      const viewLink = modal ? [...modal.querySelectorAll("a[href]")].find((a) => a.textContent.trim() === "View") : null;
      const url = viewLink?.href;
      if (url && !url.includes("linkedin.com")) {
        projectIdToUrl[projectId] = url;
      }
      const dismissBtn = document.querySelector('button[aria-label="Dismiss"]');
      if (dismissBtn) dismissBtn.click();
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  const items = [...document.querySelectorAll("main section span[aria-hidden]")].map((s) => s.innerText);
  const projects = [];
  let projectIdx = 0;
  let i = 0;

  while (i < items.length) {
    const item = items[i];
    if (POSITION_DATES.test(item) && i > 0) {
      const title = items[i - 1];
      const dates = item.match(DATE_RANGE);
      const [start, end] = dates ? [dates[1], dates[2]] : [null, null];
      const descParts = [];
      let skillList = [];
      i++;
      while (i < items.length) {
        const nxt = items[i];
        if (nxt.startsWith("Skills:")) {
          skillList = skills(nxt);
          i++;
          break;
        }
        if (POSITION_DATES.test(nxt)) break;
        descParts.push(nxt);
        i++;
      }
      let mediaCount = 0;
      while (i < items.length) {
        if (i < items.length - 1 && POSITION_DATES.test(items[i + 1])) break;
        mediaCount++;
        i++;
      }
      const desc = descParts.length ? descParts.join("\n\n") : null;
      const projectId = projectOrder[projectIdx];
      const link = (projectId && projectIdToUrl[projectId]) || null;
      projectIdx++;
      projects.push({
        title,
        link,
        start,
        end,
        description: desc ? bullets(desc) : [],
        skills: skillList,
      });
      continue;
    }
    i++;
  }
  return projects;
}

async function run() {
  const { scrapeRequested } = await chrome.storage.local.get("scrapeRequested");
  if (!scrapeRequested) return;

  const baseUrl = getBaseUrl();
  const current = getCurrentPage();

  if (!baseUrl) return;

  if (!current) {
    window.location.href = `${baseUrl}details/education/`;
    return;
  }

  const pageKey = current === "experiences" ? "experience" : current;
  const pageIdx = PAGES.indexOf(pageKey);
  if (pageIdx === -1) return;

  const { [STORAGE_KEY]: stored = {} } = await chrome.storage.local.get(STORAGE_KEY);
  const keyMap = { experience: "experiences", education: "education", certifications: "certifications", skills: "skills", projects: "projects" };
  const key = keyMap[pageKey];

  await waitAndScroll(pageKey);

  let data;
  if (pageKey === "projects") {
    data = await scrapeProjects();
  } else if (pageKey === "skills") {
    data = scrapeSkills();
  } else if (pageKey === "experience") {
    data = scrapeExperience();
  } else if (pageKey === "education") {
    data = scrapeEducation();
  } else if (pageKey === "certifications") {
    data = scrapeCertifications();
  }

  stored[key] = data;
  await chrome.storage.local.set({ [STORAGE_KEY]: stored });

  const nextIdx = pageIdx + 1;
  if (nextIdx < PAGES.length) {
    const nextPage = PAGES[nextIdx];
    const nextUrl = `${baseUrl}details/${nextPage}/`;
    window.location.href = nextUrl;
  } else {
    const resume = {
      education: stored.education || [],
      experiences: stored.experiences || [],
      certifications: stored.certifications || [],
      skills: stored.skills || [],
      projects: stored.projects || [],
    };

    chrome.runtime.sendMessage({ type: "SCRAPE_COMPLETE", data: resume }, (response) => {
      if (response?.error) {
        alert("GhostWriter: Scrape failed – " + response.error);
      } else {
        alert("GhostWriter: LinkedIn profile saved successfully!");
      }
    });

    await chrome.storage.local.remove(STORAGE_KEY);
  }
}

run().catch((e) => {
  console.error("GhostWriter scraper error:", e);
  chrome.runtime.sendMessage({ type: "SCRAPE_FAILED", error: e.message }, () => {
    alert("GhostWriter: Scrape failed – " + e.message);
  });
});
