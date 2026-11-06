import { COVER_LETTERS, EXTRACTED_FIELDS, PAY_UNITS, type ExtractedFields, type Extraction } from "../shared/applications";
import { askOpenRouter } from "./openrouter";

type Field = (typeof EXTRACTED_FIELDS)[number];
// A key that is present was settled by the posting, even when its value is null.
type Stated = Partial<ExtractedFields>;
type JsonObject = Record<string, unknown>;

// A posting page's text runs to tens of KB; this bounds what one extraction sends to the model.
const MAX_MODEL_CHARS = 60_000;
// Posting text is untrusted, so injected text must not fill a field with KBs.
const MAX_FIELD_CHARS = 300;
// Free models sometimes hang; past this the form keeps whatever JSON-LD settled.
const MODEL_TIMEOUT_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MODEL_HINTS: Record<Field, string> = {
  company: "the hiring company's name",
  position_title: "the job title as written",
  pay_low: "lowest base pay as a plain number, no currency or commas; a single figure goes in both pay_low and pay_high",
  pay_high: "highest base pay as a plain number",
  pay_unit: `what the pay is per: ${PAY_UNITS.map((unit) => `"${unit}"`).join(", ")}`,
  location: 'where the job is, as written (city, region, country, or "Remote")',
  req_id: "the employer's requisition or job ID",
  deadline: "the application deadline the posting states, as YYYY-MM-DD",
  cover_letter: `${COVER_LETTERS.map((value) => `"${value}"`).join(", ")}; "none" only when the posting says not to send one`,
};

export async function extractFields(text: string, jobPosting: JsonObject | null): Promise<Extraction> {
  const link = text.split("\n", 1)[0];
  const stated = withoutPostingUuid(jobPosting ? fieldsFromJobPosting(jobPosting) : {}, link);
  const missing = EXTRACTED_FIELDS.filter((field) => !(field in stated));

  let fromModel: Stated = {};
  let error: string | null = null;
  if (missing.length && text.trim()) {
    try {
      fromModel = withoutPostingUuid(await askModel(text, missing), link);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      console.warn(`extract model failed for ${missing.join(",")}: ${error}`);
    }
  }

  const fields = Object.fromEntries(EXTRACTED_FIELDS.map((field) => [field, stated[field] ?? fromModel[field] ?? null])) as ExtractedFields;
  if (fields.pay_low !== null && fields.pay_high !== null && fields.pay_low > fields.pay_high) {
    console.warn(`extract dropped pay ${fields.pay_low} > ${fields.pay_high}`);
    fields.pay_low = fields.pay_high = null;
  }

  console.log(`extract json-ld=${filledOf(stated)} model=${filledOf(fromModel)}`);
  return { fields, error };
}

// validThrough is left out: ATSs set it as the listing's expiry, not an application deadline.
export function fieldsFromJobPosting(posting: JsonObject): Stated {
  const stated = {
    company: nameOf(posting.hiringOrganization),
    position_title: textOf(posting.title),
    ...payOf(posting.baseSalary),
    location: locationOf(posting.jobLocation),
    req_id: textOf(posting.identifier) ?? (isObject(posting.identifier) ? textOf(posting.identifier.value) : undefined),
  };
  return Object.fromEntries(Object.entries(stated).filter(([, value]) => value !== undefined));
}

async function askModel(text: string, missing: Field[]): Promise<Stated> {
  const hints = missing.map((field) => `- ${field}: ${MODEL_HINTS[field]}`).join("\n");
  const prompt = `Read the job posting below and return one JSON object with exactly these keys:
${hints}

Use null for any field the posting does not state. Never guess or infer a value. Return only the JSON object.

Posting:
${text.slice(0, MAX_MODEL_CHARS)}`;
  const options = { maxTokens: 1024, temperature: 0, signal: AbortSignal.timeout(MODEL_TIMEOUT_MS) };

  const output = await askOpenRouter(prompt, options);
  if (!isObject(output)) throw new Error("Model did not return a JSON object");
  return Object.fromEntries(missing.map((field) => [field, modelValueOf(field, output[field])]));
}

// Ashby and Lever post under their own UUID, which JSON-LD and the model both offer as the req ID.
function withoutPostingUuid(fields: Stated, link: string): Stated {
  const segments = URL.parse(link.trim())?.pathname.split("/") ?? [];
  if (!fields.req_id || !UUID.test(fields.req_id) || !segments.includes(fields.req_id)) return fields;
  const { req_id: _, ...rest } = fields;
  return rest;
}

function modelValueOf(field: Field, value: unknown) {
  if (field === "pay_low" || field === "pay_high") return numberOf(value) ?? null;
  if (field === "pay_unit") return typeof value === "string" && isPayUnit(value) ? value : null;
  if (field === "cover_letter") return COVER_LETTERS.find((option) => option === value) ?? null;
  if (field === "deadline") return dayOf(value) ?? null;
  return textOf(value) ?? null;
}

function payOf(baseSalary: unknown): Stated {
  const salary = firstOf(baseSalary);
  if (!isObject(salary)) return {};
  // MonetaryAmount.value is either a QuantitativeValue or a bare number.
  const quantity = isObject(salary.value) ? salary.value : salary;

  const low = numberOf(quantity.minValue ?? quantity.value);
  const high = numberOf(quantity.maxValue ?? quantity.value);
  if (low === undefined && high === undefined) return {};

  const unit = textOf(quantity.unitText ?? salary.unitText)?.toLowerCase();
  if (unit === undefined) return { pay_low: low ?? null, pay_high: high ?? null };
  // WEEK and DAY have no pay_unit; an amount without its unit would read as yearly or hourly.
  if (!isPayUnit(unit)) return { pay_low: null, pay_high: null, pay_unit: null };
  return { pay_low: low ?? null, pay_high: high ?? null, pay_unit: unit };
}

function locationOf(jobLocation: unknown) {
  const places = (Array.isArray(jobLocation) ? jobLocation : [jobLocation]).map((place) => {
    const address = isObject(place) ? place.address : undefined;
    if (!isObject(address)) return textOf(address);
    const parts = [textOf(address.addressLocality), textOf(address.addressRegion), nameOf(address.addressCountry)];
    return [...new Set(parts.filter((part) => part !== undefined))].join(", ") || undefined;
  });
  return [...new Set(places.filter((place) => place !== undefined))].join("; ") || undefined;
}

function dayOf(value: unknown) {
  const day = textOf(value)?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (day === undefined) return undefined;
  // Date rolls 2026-02-30 over to March, so only a day that round-trips is real.
  const time = Date.parse(day);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(day) ? day : undefined;
}

const filledOf = (fields: Stated) =>
  Object.entries(fields)
    .filter(([, value]) => value !== null)
    .map(([field]) => field)
    .join(",") || "none";

function nameOf(value: unknown) {
  return textOf(value) ?? (isObject(value) ? textOf(value.name) : undefined);
}

function textOf(value: unknown) {
  const first = firstOf(value);
  if (typeof first === "number") return String(first);
  return typeof first === "string" && first.trim() ? first.trim().slice(0, MAX_FIELD_CHARS) : undefined;
}

function numberOf(value: unknown) {
  const number = typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= 0 ? number : undefined;
}

const isPayUnit = (unit: string): unit is (typeof PAY_UNITS)[number] => (PAY_UNITS as readonly string[]).includes(unit);

const firstOf = (value: unknown) => (Array.isArray(value) ? value[0] : value);

const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);
