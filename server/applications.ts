import type { Database } from "bun:sqlite";
import {
  CONTACT_FIELDS,
  COVER_LETTERS,
  LOCATION_TYPES,
  PAY_UNITS,
  STATUSES,
  type Application,
  type Contact,
  type Source,
  type Status,
  type StatusEvent,
} from "../shared/applications";

// A posting page's innerText runs to tens of KB; anything past this is not a job description.
const MAX_DESCRIPTION_CHARS = 200_000;

// Share and tracking params differ per click on the same posting, so they must not split one job into two rows.
const TRACKING_PARAMS = ["trk", "refId", "trackingId"];

const LISTED_APPLICATIONS = `
  SELECT a.id, a.company, a.position_title, a.pay_low, a.pay_high, a.pay_unit, a.location, a.location_type,
         a.start_date, a.cover_letter, a.cover_letter_sent, a.link, a.source, a.req_id, a.deadline, a.contacts, a.notes,
         e.status, e.at AS status_at
  FROM applications a
  LEFT JOIN status_events e
    ON e.id = (SELECT id FROM status_events WHERE application_id = a.id ORDER BY at DESC, id DESC LIMIT 1)`;

const EDITABLE_FIELDS = {
  company: optionalText,
  position_title: optionalText,
  pay_low: amount,
  pay_high: amount,
  pay_unit: oneOf(PAY_UNITS),
  location: optionalText,
  location_type: oneOf(LOCATION_TYPES),
  start_date: optionalText,
  cover_letter: oneOf(COVER_LETTERS),
  cover_letter_sent: flag,
  req_id: optionalText,
  deadline: optionalText,
  contacts: contactsJson,
  notes: optionalText,
} satisfies Partial<Record<keyof Application, Parser>>;

type NewApplication = { description: string; link: string | null; source: Source | null };
type StoredValue = string | number | null;
type Parser = (value: unknown, field: string) => StoredValue;
type PayRange = { pay_low: number | null; pay_high: number | null };
type ApplicationRow = Omit<Application, "cover_letter_sent" | "contacts"> & { cover_letter_sent: number; contacts: string };

export function addApplication(db: Database, body: unknown) {
  const { description, link, source } = validateNew(body);

  if (link) {
    const existing = db.query("SELECT id FROM applications WHERE link = ?").get(link) as { id: number } | null;
    if (existing) return { id: existing.id, created: false };
  }

  const { id } = db
    .query("INSERT INTO applications (description, link, source) VALUES (?, ?, ?) RETURNING id")
    .get(description, link, source) as { id: number };
  return { id, created: true };
}

export function listApplications(db: Database) {
  return (db.query(`${LISTED_APPLICATIONS} ORDER BY a.id DESC`).all() as ApplicationRow[]).map(fromRow);
}

export function updateApplication(db: Database, id: number, body: unknown) {
  const changes = validateEdit(body);

  return db.transaction(() => {
    const stored = db.query("SELECT pay_low, pay_high FROM applications WHERE id = ?").get(id) as PayRange | null;
    if (!stored) return null;

    const edits = Object.fromEntries(changes);
    const low = "pay_low" in edits ? edits.pay_low : stored.pay_low;
    const high = "pay_high" in edits ? edits.pay_high : stored.pay_high;
    if (typeof low === "number" && typeof high === "number" && low > high) {
      throw new Error("pay_low must not exceed pay_high");
    }

    if (changes.length) {
      const assignments = changes.map(([field]) => `${field} = ?`).join(", ");
      db.query(`UPDATE applications SET ${assignments} WHERE id = ?`).run(...changes.map(([, value]) => value), id);
    }

    const row = db.query(`${LISTED_APPLICATIONS} WHERE a.id = ?`).get(id) as ApplicationRow;
    return { application: fromRow(row), fields: changes.map(([field]) => field) };
  })();
}

export function addStatusEvent(db: Database, applicationId: number, body: unknown) {
  const status = validateEvent(body);
  if (db.query("SELECT 1 FROM applications WHERE id = ?").get(applicationId) === null) return null;

  return db
    .query("INSERT INTO status_events (application_id, status) VALUES (?, ?) RETURNING id, status, at")
    .get(applicationId, status) as StatusEvent;
}

function validateNew(body: unknown): NewApplication {
  const { text, link } = objectOf(body, "Application");

  if (typeof text !== "string" || !text.trim()) throw new Error("text must be a non-empty string");
  const description = text.trim();
  if (description.length > MAX_DESCRIPTION_CHARS) throw new Error(`text is over ${MAX_DESCRIPTION_CHARS} characters`);

  if (link === undefined || link === null) return { description, link: null, source: null };
  if (typeof link !== "string") throw new Error("link must be a URL");
  if (!link.trim()) return { description, link: null, source: null };

  const url = URL.parse(link.trim());
  if (!url) throw new Error("link must be a URL");
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("link must be http or https");
  return { description, link: canonical(url), source: sourceOf(url.hostname) };
}

function validateEdit(body: unknown) {
  const input = objectOf(body, "Application");
  const unknownField = Object.keys(input).find((field) => !Object.hasOwn(EDITABLE_FIELDS, field));
  if (unknownField) throw new Error(`unknown field ${unknownField}`);

  return Object.entries(EDITABLE_FIELDS)
    .filter(([field]) => input[field] !== undefined)
    .map(([field, parse]) => [field, parse(input[field], field)] as const);
}

function validateEvent(body: unknown) {
  const { status } = objectOf(body, "Status event");
  if (!STATUSES.includes(status as Status)) throw new Error(`status must be one of ${STATUSES.join(", ")}`);
  return status as Status;
}

function objectOf(body: unknown, name: string) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error(`${name} must be an object`);
  return body as Record<string, unknown>;
}

function fromRow(row: ApplicationRow): Application {
  return { ...row, cover_letter_sent: row.cover_letter_sent === 1, contacts: JSON.parse(row.contacts) };
}

function optionalText(value: unknown, field: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value.trim() || null;
}

function amount(value: unknown, field: string) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${field} must be a non-negative number`);
  return value;
}

function oneOf(allowed: readonly string[]) {
  return (value: unknown, field: string) => {
    if (value === null) return null;
    if (!allowed.includes(value as string)) throw new Error(`${field} must be one of ${allowed.join(", ")}`);
    return value as string;
  };
}

function flag(value: unknown, field: string) {
  if (typeof value !== "boolean") throw new Error(`${field} must be true or false`);
  return value ? 1 : 0;
}

function contactsJson(value: unknown, field: string) {
  if (!Array.isArray(value)) throw new Error(`${field} must be a list`);
  const contacts = value.map((entry) => {
    const input = objectOf(entry, "Contact");
    const contact: Contact = {};
    for (const key of CONTACT_FIELDS) {
      const kept = optionalText(input[key], `contact ${key}`);
      if (kept) contact[key] = kept;
    }
    return contact;
  });
  return JSON.stringify(contacts.filter((contact) => Object.keys(contact).length > 0));
}

function canonical(url: URL) {
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || TRACKING_PARAMS.includes(key)) url.searchParams.delete(key);
  }
  return url.href;
}

function sourceOf(host: string): Source {
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
  if (host === "simplify.jobs" || host.endsWith(".simplify.jobs")) return "simplify";
  return "website";
}
