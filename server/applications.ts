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
  SELECT id, company, position_title, pay_low, pay_high, pay_unit, location, location_type, start_date,
         cover_letter, cover_letter_sent, link, source, req_id, deadline, contacts, notes
  FROM applications`;

const LISTED_EVENTS = "SELECT id, application_id, status, at FROM status_events";
// id breaks same-millisecond ties in recorded order.
const EVENT_ORDER = "ORDER BY at, id";

// Date.parse alone also takes "10/28/2026", and reads a time with no offset in the server's own zone.
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

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
type ApplicationRow = Omit<Application, "cover_letter_sent" | "contacts" | "events"> & {
  cover_letter_sent: number;
  contacts: string;
};
type EventRow = StatusEvent & { application_id: number };
type NewEvent = { status: Status; at: string };
type EventRefusal = "missing" | "not_last_recorded";

export function addApplication(db: Database, body: unknown) {
  const { text, link: linkInput, ...fields } = objectOf(body, "Application");
  const { description, link, source } = validateNew(text, linkInput);
  const changes = validateEdit(fields);
  const edits = Object.fromEntries(changes);
  checkPayRange(edits.pay_low ?? null, edits.pay_high ?? null);

  if (link) {
    const existing = db.query("SELECT id FROM applications WHERE link = ?").get(link) as { id: number } | null;
    if (existing) return { id: existing.id, created: false };
  }

  const columns = ["description", "link", "source", ...changes.map(([field]) => field)];
  const values = [description, link, source, ...changes.map(([, value]) => value)];
  const { id } = db
    .query(`INSERT INTO applications (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) RETURNING id`)
    .get(...values) as { id: number };
  return { id, created: true };
}

export function listApplications(db: Database) {
  const rows = db.query(`${LISTED_APPLICATIONS} ORDER BY id DESC`).all() as ApplicationRow[];
  const events = db.query(`${LISTED_EVENTS} ${EVENT_ORDER}`).all() as EventRow[];

  const eventsByApplication = Map.groupBy(events, (event) => event.application_id);
  return rows.map((row) => fromRow(row, eventsByApplication.get(row.id) ?? []));
}

export function updateApplication(db: Database, id: number, body: unknown) {
  const changes = validateEdit(body);

  return db.transaction(() => {
    const stored = db.query("SELECT pay_low, pay_high FROM applications WHERE id = ?").get(id) as PayRange | null;
    if (!stored) return null;

    const edits = Object.fromEntries(changes);
    checkPayRange("pay_low" in edits ? edits.pay_low : stored.pay_low, "pay_high" in edits ? edits.pay_high : stored.pay_high);

    if (changes.length) {
      const assignments = changes.map(([field]) => `${field} = ?`).join(", ");
      db.query(`UPDATE applications SET ${assignments} WHERE id = ?`).run(...changes.map(([, value]) => value), id);
    }

    const row = db.query(`${LISTED_APPLICATIONS} WHERE id = ?`).get(id) as ApplicationRow;
    const events = db.query(`${LISTED_EVENTS} WHERE application_id = ? ${EVENT_ORDER}`).all(id) as EventRow[];
    return { application: fromRow(row, events), fields: changes.map(([field]) => field) };
  })();
}

export function addStatusEvent(db: Database, applicationId: number, body: unknown) {
  const { status, at } = validateEvent(body);
  if (db.query("SELECT 1 FROM applications WHERE id = ?").get(applicationId) === null) return null;

  return db
    .query("INSERT INTO status_events (application_id, status, at) VALUES (?, ?, ?) RETURNING id, status, at")
    .get(applicationId, status, at) as StatusEvent;
}

// Undo targets the last event recorded, not the latest by date, so undoing a backdated event works.
export function deleteStatusEvent(db: Database, applicationId: number, eventId: number): StatusEvent | EventRefusal {
  return db.transaction(() => {
    const found = db.query("SELECT 1 FROM status_events WHERE id = ? AND application_id = ?").get(eventId, applicationId);
    if (found === null) return "missing";

    const { lastRecorded } = db
      .query("SELECT MAX(id) AS lastRecorded FROM status_events WHERE application_id = ?")
      .get(applicationId) as { lastRecorded: number };
    if (lastRecorded !== eventId) return "not_last_recorded";

    return db.query("DELETE FROM status_events WHERE id = ? RETURNING id, status, at").get(eventId) as StatusEvent;
  })();
}

function validateNew(text: unknown, link: unknown): NewApplication {
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

function checkPayRange(low: StoredValue, high: StoredValue) {
  if (typeof low === "number" && typeof high === "number" && low > high) throw new Error("pay_low must not exceed pay_high");
}

function validateEvent(body: unknown): NewEvent {
  const { status: value, at } = objectOf(body, "Status event");
  if (!STATUSES.includes(value as Status)) throw new Error(`status must be one of ${STATUSES.join(", ")}`);
  const status = value as Status;

  const now = Date.now();
  if (at === undefined || at === null) return { status, at: new Date(now).toISOString() };

  const time = typeof at === "string" && ISO_TIMESTAMP.test(at) ? Date.parse(at) : NaN;
  if (!Number.isFinite(time)) throw new Error("at must be an ISO timestamp");
  if (time > now) throw new Error("at must not be in the future");
  return { status, at: new Date(time).toISOString() };
}

function objectOf(body: unknown, name: string) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error(`${name} must be an object`);
  return body as Record<string, unknown>;
}

function fromRow(row: ApplicationRow, events: EventRow[]): Application {
  return {
    ...row,
    cover_letter_sent: row.cover_letter_sent === 1,
    contacts: JSON.parse(row.contacts),
    events: events.map(({ id, status, at }) => ({ id, status, at })),
  };
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
