/**
 * Extract company and role_id from Workday job URLs for storage paths.
 *
 * Supports multiple Workday URL patterns:
 * - ResMed: /en-US/ResMed_External_Careers/job/.../Title_JR_047750
 * - Disney: /disneycareer/job/.../Title_10135270
 * - Airbus: /Airbus/job/.../Title_JR10355957
 * - GEICO: /en-US/External/job/.../Title_R0061412
 * - Neurocrine: /en-US/Neurocrinecareers/job/.../Title_R6359
 * - Motorola: /Careers/job/.../Title_R60172
 * - ASML: /en-US/ASMLEXT1/job/.../Title_J-00329552
 * - Capital One: /Capital_One/job/.../Title_R218625-1
 */

export interface ParsedJobUrl {
  company: string;
  roleId: string;
  isValid: boolean;
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

export function parseJobUrl(url: string): ParsedJobUrl {
  const trimmed = url.trim();
  if (!trimmed) {
    return { company: "unknown", roleId: "manual", isValid: false };
  }

  try {
    const u = new URL(trimmed);
    const path = u.pathname;
    const hostname = u.hostname;

    let company = "unknown";

    // 1. /en-US/CompanyName_External_Careers/job/ or /en-US/CompanyName_Careers/job/
    const externalCareers = path.match(/\/en-[A-Z]{2}\/([^_/]+)_(?:External_)?Careers?\//i);
    if (externalCareers) {
      company = externalCareers[1];
    }
    // 2. /en-US/CompanyNamecareers/job/ or /en-US/CompanyNamecareer/job/
    else {
      const careersSuffix = path.match(/\/en-[A-Z]{2}\/([A-Za-z]+)careers?\//i);
      if (careersSuffix) {
        company = careersSuffix[1];
      }
    }
    // 3. /CompanyName/job/ (Airbus, Capital_One)
    if (company === "unknown") {
      const jobMatch = path.match(/^\/([^/]+)\/job\//);
      if (jobMatch && !/^(en-[A-Z]{2}|job)$/i.test(jobMatch[1])) {
        company = jobMatch[1];
      }
    }
    // 4. /disneycareer/job/ - single segment ending in "career"
    if (company === "unknown") {
      const careerMatch = path.match(/^\/([A-Za-z]+)career\/job\//i);
      if (careerMatch) {
        company = careerMatch[1];
      }
    }
    // 5. /en-US/ASMLEXT1/ - extract leading letters
    if (company === "unknown") {
      const extMatch = path.match(/\/en-[A-Z]{2}\/([A-Za-z]+)EXT\d*\//i);
      if (extMatch) {
        company = extMatch[1];
      }
    }
    // 6. Fallback: use subdomain (geico, motorolasolutions, etc.)
    if (company === "unknown" || /^(External|Careers)$/i.test(company)) {
      const fromHost = companyFromSubdomain(hostname);
      if (fromHost) company = fromHost;
    }

    company = sanitizePathSegment(company);

    // Role ID: last path segment, after final underscore
    const segments = path.split("/").filter(Boolean);
    const lastSegment = decodeURIComponent(segments[segments.length - 1] ?? "").split("?")[0] ?? "";
    const roleMatch =
      lastSegment.match(/_([A-Z]{1,3}_?\d[\d-]*)$/i) ??
      lastSegment.match(/_([A-Z]-[\w-]+)$/i) ??
      lastSegment.match(/_(\d+)$/);
    const roleId = roleMatch
      ? sanitizePathSegment(roleMatch[1])
      : sanitizePathSegment(lastSegment) || "manual";

    return {
      company: company || "unknown",
      roleId: roleId || "manual",
      isValid: company !== "unknown" || roleId !== "manual",
    };
  } catch {
    return { company: "unknown", roleId: "manual", isValid: false };
  }
}

/** Build filename from user name: "John Doe" -> "John_Doe_Resume.tex" */
export function buildResumeFileName(userName: string | null | undefined): string {
  if (!userName?.trim()) return "resume.tex";
  const parts = userName.trim().split(/\s+/);
  const first = parts[0] ?? "First";
  const last = parts.slice(1).join(" ") || "Last";
  const slug = [first, last].map((s) => sanitizePathSegment(s)).join("_");
  return `${slug}_Resume.tex`;
}

/** Options for parseHourlyRange */
export interface ParseHourlyRangeOptions {
  /** Allow plain numbers (no $) for manual input; skip when parsing job descriptions to avoid false positives like "4901-4920" */
  allowPlainNumbers?: boolean;
}

/**
 * Parse hourly/salary range from text into [min, max] or [single].
 * Handles: $23.25-$42.75/hr, $23.25 - $42.75/hour, $174,000 - $174,000 (salary), etc.
 */
export function parseHourlyRange(
  text: string,
  options: ParseHourlyRangeOptions = {},
): number[] | null {
  const { allowPlainNumbers = false } = options;
  const num = (s: string) => parseFloat(s.replace(/,/g, "")) || 0;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const toRange = (lo: number, hi: number) => (lo === hi ? [lo] : [Math.min(lo, hi), Math.max(lo, hi)]);
  const HOURS_PER_YEAR = 2080;
  const HOURS_PER_MONTH = 173.33; // 2080/12
  const MONTHLY_THRESHOLD = 5000; // $5k+ unlabeled → assume monthly
  const YEARLY_THRESHOLD = 20000; // $20k+ unlabeled → assume yearly

  // 1. Hourly range: $X - $Y /hour or $X-$Y/hr
  const hourlyRangeRe =
    /\$\s*([\d,]+(?:\.\d+)?)\s*[-–—]\s*\$\s*([\d,]+(?:\.\d+)?)\s*(?:\/|per)?\s*(?:hour|hr)\b/gi;
  let m = hourlyRangeRe.exec(text);
  if (m) {
    const lo = round2(num(m[1]));
    const hi = round2(num(m[2]));
    if (lo > 0 && hi > 0) return toRange(lo, hi);
  }

  // 2. Hourly single: $X/hour or $X/hr
  const hourlySingleRe = /\$\s*([\d,]+(?:\.\d+)?)\s*(?:\/|per)\s*(?:hour|hr)\b/gi;
  m = hourlySingleRe.exec(text);
  if (m) {
    const v = round2(num(m[1]));
    if (v > 0) return [v];
  }

  // 3. Salary range with unit: $X - $Y /year
  const salaryRangeRe =
    /\$\s*([\d,]+(?:\.\d+)?)\s*[-–—]\s*\$\s*([\d,]+(?:\.\d+)?)\s*(?:\/|per)?\s*(?:year|yr)\b/gi;
  m = salaryRangeRe.exec(text);
  if (m) {
    const lo = round2(num(m[1]) / HOURS_PER_YEAR);
    const hi = round2(num(m[2]) / HOURS_PER_YEAR);
    if (lo > 0 && hi > 0) return toRange(lo, hi);
  }

  // 4. Salary single: $X/year
  const salarySingleRe = /\$\s*([\d,]+(?:\.\d+)?)\s*(?:\/|per)\s*(?:year|yr)\b/gi;
  m = salarySingleRe.exec(text);
  if (m) {
    const v = round2(num(m[1]) / HOURS_PER_YEAR);
    if (v > 0) return [v];
  }

  // 5. Monthly range: $X - $Y /month or /mo
  const monthlyRangeRe =
    /\$\s*([\d,]+(?:\.\d+)?)\s*[-–—]\s*\$\s*([\d,]+(?:\.\d+)?)\s*(?:\/|per)?\s*(?:month|mo)\b/gi;
  m = monthlyRangeRe.exec(text);
  if (m) {
    const lo = round2(num(m[1]) / HOURS_PER_MONTH);
    const hi = round2(num(m[2]) / HOURS_PER_MONTH);
    if (lo > 0 && hi > 0) return toRange(lo, hi);
  }

  // 6. Monthly single: $X/month or $X/mo
  const monthlySingleRe = /\$\s*([\d,]+(?:\.\d+)?)\s*(?:\/|per)\s*(?:month|mo)\b/gi;
  m = monthlySingleRe.exec(text);
  if (m) {
    const v = round2(num(m[1]) / HOURS_PER_MONTH);
    if (v > 0) return [v];
  }

  // 7. Unlabeled: $5k+ monthly, $20k+ yearly, <$1k hourly
  const unlabeledRangeRe = /\$\s*([\d,]+(?:\.\d+)?)\s*[-–—]\s*\$\s*([\d,]+(?:\.\d+)?)/g;
  m = unlabeledRangeRe.exec(text);
  if (m) {
    const a = num(m[1]);
    const b = num(m[2]);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (lo >= YEARLY_THRESHOLD) {
      return toRange(round2(lo / HOURS_PER_YEAR), round2(hi / HOURS_PER_YEAR));
    }
    if (lo >= MONTHLY_THRESHOLD) {
      return toRange(round2(lo / HOURS_PER_MONTH), round2(hi / HOURS_PER_MONTH));
    }
    if (lo > 0 && hi > 0 && lo < 1000) return toRange(round2(lo), round2(hi)); // likely hourly
  }

  // 8. Plain numbers (user-edited field only): 23.25 - 42.75 or 23.25
  if (allowPlainNumbers) {
    const plainRangeRe = /([\d,]+(?:\.\d+)?)\s*[-–—]\s*([\d,]+(?:\.\d+)?)/;
    const plainRange = text.match(plainRangeRe);
    if (plainRange) {
      const lo = round2(num(plainRange[1] ?? ""));
      const hi = round2(num(plainRange[2] ?? ""));
      if (lo > 0 && hi > 0 && hi < 10000) return toRange(lo, hi);
    }
    const plainSingleRe = /([\d,]+(?:\.\d+)?)/;
    const plainSingle = text.match(plainSingleRe);
    if (plainSingle) {
      const v = round2(num(plainSingle[1] ?? ""));
      if (v > 0 && v < 10000) return [v];
    }
  }

  return null;
}

/** Format hourly_range array for display (2 decimals) */
export function formatHourlyRange(arr: number[] | null): string {
  if (!arr?.length) return "";
  if (arr.length === 1 || arr[0] === arr[1]) return arr[0].toFixed(2);
  return `${arr[0].toFixed(2)} - ${arr[1].toFixed(2)}`;
}

/** Build storage path: user_id/company/role_id/First_Last_Resume.tex */
export function buildRolesStoragePath(
  userId: string,
  jobUrlOrCompany: string,
  roleId?: string,
  fileName?: string,
): string {
  const fn = fileName ?? "resume.tex";
  if (roleId !== undefined) {
    return `${userId}/${sanitizePathSegment(jobUrlOrCompany)}/${sanitizePathSegment(roleId)}/${fn}`;
  }
  const { company, roleId: id } = parseJobUrl(jobUrlOrCompany);
  return `${userId}/${company}/${id}/${fn}`;
}
