/**
 * LLM prompts for job parsing.
 * LLM extracts: company, role_id, rate (raw - any format).
 * Code-side: parse rate to hourly.
 */

export const EXTRACT_PROMPT = `Extract structured data from this job posting.

URL: {{url}}

Job description (excerpt - may contain salary/rate info):
{{excerpt}}

Return only valid JSON. No markdown, no backticks. First char must be {, last must be }.
Schema:
{
  "company": "string (company name, e.g. ResMed, Capital One)",
  "roleId": "string (job identifier from URL path, e.g. JR_047750, R218625)",
  "rate": "string or null (raw rate as written, e.g. \\"$174,000 - $174,000/year\\", \\"$23.25 - $42.75/hour\\", \\"$8,000/month\\". Omit if not found)"
}`;

export function buildExtractPrompt(url: string, excerpt: string): string {
  return EXTRACT_PROMPT.replace("{{url}}", url).replace("{{excerpt}}", excerpt);
}
