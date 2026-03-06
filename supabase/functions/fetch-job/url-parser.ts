/**
 * Parse job posting URL to extract company and role ID.
 * Can be implemented with regex (for Workday) or LLM.
 */

export interface ParsedUrl {
  company: string;
  roleId: string;
}

export function getJobBoardProvider(url: string): "workday" | "unknown" {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (
      host.includes(".myworkdayjobs.com") ||
      host.includes(".myworkdaysite.com") ||
      host.includes("workday.com")
    ) {
      return "workday";
    }
  } catch {
    /* invalid url */
  }
  return "unknown";
}

/** Sanitize for storage path - alphanumeric, underscore, hyphen only */
function sanitizePathSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "unknown";
}

/** Extract company name from subdomain (e.g. capitalone -> CapitalOne) */
function companyFromSubdomain(hostname: string): string {
  const sub = hostname.split(".")[0] ?? "";
  const base = sub.replace(/^([a-z]+)wd\d+$/i, "$1").replace(/wd\d+$/i, "") || sub;
  if (!base) return "unknown";
  return base
    .replace(/([A-Z])/g, " $1")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

/**
 * Parse Workday URL to extract company and role ID.
 * Regex-based fallback.
 */
export function parseUrl(url: string): ParsedUrl | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const u = new URL(trimmed);
    const path = u.pathname;
    const hostname = u.hostname;

    let company = "unknown";

    // /en-US/CompanyName_External_Careers/job/ or /en-US/CompanyName_Careers/job/
    const externalCareers = path.match(/\/en-[A-Z]{2}\/([^_/]+)_(?:External_)?Careers?\//i);
    if (externalCareers) {
      company = externalCareers[1];
    } else {
      const careersSuffix = path.match(/\/en-[A-Z]{2}\/([A-Za-z]+)careers?\//i);
      if (careersSuffix) company = careersSuffix[1];
    }

    if (company === "unknown") {
      const jobMatch = path.match(/^\/([^/]+)\/job\//);
      if (jobMatch && !/^(en-[A-Z]{2}|job)$/i.test(jobMatch[1])) {
        company = jobMatch[1];
      }
    }

    if (company === "unknown") {
      const careerMatch = path.match(/^\/([A-Za-z]+)career\/job\//i);
      if (careerMatch) company = careerMatch[1];
    }

    if (company === "unknown") {
      const extMatch = path.match(/\/en-[A-Z]{2}\/([A-Za-z]+)EXT\d*\//i);
      if (extMatch) company = extMatch[1];
    }

    if (company === "unknown" || /^(External|Careers)$/i.test(company)) {
      const fromHost = companyFromSubdomain(hostname);
      if (fromHost) company = fromHost;
    }

    company = sanitizePathSegment(company);

    const segments = path.split("/").filter(Boolean);
    const lastSegment = decodeURIComponent(segments[segments.length - 1] ?? "").split("?")[0] ?? "";
    const roleMatch =
      lastSegment.match(/_([A-Z]{1,3}_?\d[\d-]*)$/i) ??
      lastSegment.match(/_([A-Z]-[\w-]+)$/i) ??
      lastSegment.match(/_(\d+)$/);
    const roleId = roleMatch
      ? sanitizePathSegment(roleMatch[1])
      : sanitizePathSegment(lastSegment) || "manual";

    return { company: company || "unknown", roleId: roleId || "manual" };
  } catch {
    return null;
  }
}
