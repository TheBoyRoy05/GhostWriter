export function pageJob(url, text, ldJsonScripts) {
  return { text: jobText(url, text), jobPosting: findJobPosting(ldJsonScripts) };
}

export function pastedJob(description, link) {
  if (!description) throw new Error("Paste a job description first.");
  if (link && !isWebUrl(link)) throw new Error("Use a full job link starting with https://, or leave it empty.");
  return { text: jobText(link, description), jobPosting: null };
}

// The app reads the first line as the job's link (web/src/NewApplication.tsx linkOf).
function jobText(link, body) {
  return link ? `${link}\n\n${body}` : body;
}

function isWebUrl(link) {
  const url = URL.parse(link);
  return url?.protocol === "http:" || url?.protocol === "https:";
}

function findJobPosting(ldJsonScripts) {
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
