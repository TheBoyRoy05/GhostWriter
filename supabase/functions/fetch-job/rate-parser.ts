/**
 * Parse raw rate string (from LLM) to hourly rate array.
 * Handles: $X/hr, $X/year, $X/month, ranges, etc.
 */

const HOURS_PER_YEAR = 2080;
const HOURS_PER_MONTH = 173.33;
const MONTHLY_THRESHOLD = 5000;
const YEARLY_THRESHOLD = 20000;

function num(s: string): number {
  return parseFloat(s.replace(/,/g, "")) || 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toRange(lo: number, hi: number): number[] {
  return lo === hi ? [lo] : [Math.min(lo, hi), Math.max(lo, hi)];
}

/**
 * Parse raw rate string to hourly rate array.
 * Returns [min, max] or [single], or null if unparseable.
 */
export function parseRateToHourly(rate: string | null | undefined): number[] | null {
  const text = rate?.trim();
  if (!text) return null;

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

  // 7. Unlabeled: $20k+ yearly, $5k+ monthly, <$1k hourly
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
    if (lo > 0 && hi > 0 && lo < 1000) return toRange(round2(lo), round2(hi));
  }

  return null;
}
