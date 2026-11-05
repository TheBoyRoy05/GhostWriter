import { describe, expect, test } from "bun:test";
import { openDatabase } from "./db";
import { addApplication, addStatusEvent, deleteStatusEvent, listApplications, updateApplication } from "./applications";

const open = () => openDatabase(":memory:");
const rowOf = (db: ReturnType<typeof open>, id: number) =>
  db.query("SELECT description, link, source FROM applications WHERE id = ?").get(id);
const countOf = (db: ReturnType<typeof open>) => (db.query("SELECT COUNT(*) AS n FROM applications").get() as { n: number }).n;
const eventCountOf = (db: ReturnType<typeof open>) =>
  (db.query("SELECT COUNT(*) AS n FROM status_events").get() as { n: number }).n;

describe("addApplication", () => {
  test("creates a row with trimmed description, link and derived source", () => {
    const db = open();
    const { id, created } = addApplication(db, { text: "  SWE Intern\n", link: "https://www.linkedin.com/jobs/view/1" });
    expect(created).toBe(true);
    expect(rowOf(db, id)).toEqual({ description: "SWE Intern", link: "https://www.linkedin.com/jobs/view/1", source: "linkedin" });
  });

  test.each([
    ["https://linkedin.com/jobs/view/1", "linkedin"],
    ["https://simplify.jobs/p/abc", "simplify"],
    ["https://jobs.simplify.jobs/p/abc", "simplify"],
    ["https://careers.acme.com/42", "website"],
    ["https://notlinkedin.com/jobs", "website"],
  ])("derives source of %s as %s", (link, source) => {
    const db = open();
    const { id } = addApplication(db, { text: "Job", link });
    expect((rowOf(db, id) as { source: string }).source).toBe(source);
  });

  test.each([undefined, null, "", "   "])("link %p is stored as no link and no source", (link) => {
    const db = open();
    const { id } = addApplication(db, { text: "Job", link });
    expect(rowOf(db, id)).toEqual({ description: "Job", link: null, source: null });
  });

  test("stores the link without tracking params, fragment or padding, keeping job-id params", () => {
    const db = open();
    const link = "  https://www.LinkedIn.com/jobs/search?currentJobId=7&trk=abc&refId=x&utm_source=mail#top ";
    const { id } = addApplication(db, { text: "Job", link });
    expect((rowOf(db, id) as { link: string }).link).toBe("https://www.linkedin.com/jobs/search?currentJobId=7");
  });

  test("same posting returns the existing application and keeps its first description", () => {
    const db = open();
    const first = addApplication(db, { text: "Job", link: "https://acme.com/1" });
    const again = addApplication(db, { text: "Job, edited", link: " https://acme.com/1?utm_medium=share " });
    expect(again).toEqual({ id: first.id, created: false });
    expect(countOf(db)).toBe(1);
    expect((rowOf(db, first.id) as { description: string }).description).toBe("Job");
  });

  test("pastes without a link never merge", () => {
    const db = open();
    addApplication(db, { text: "Job" });
    addApplication(db, { text: "Job" });
    expect(countOf(db)).toBe(2);
  });

  test("database refuses two rows with the same link", () => {
    const db = open();
    db.run("INSERT INTO applications (link) VALUES ('https://acme.com/1')");
    expect(() => db.run("INSERT INTO applications (link) VALUES ('https://acme.com/1')")).toThrow();
  });

  test("stores the application fields sent beside the posting", () => {
    const db = open();
    const fields = { company: " Acme ", position_title: "SWE", pay_low: 100, pay_high: 120, location: "Austin", deadline: "2026-12-01" };
    const { id } = addApplication(db, { text: "Job", link: "https://acme.com/1", ...fields });
    expect(listApplications(db).find((application) => application.id === id)).toMatchObject({ ...fields, company: "Acme" });
  });

  test("text padded past the limit is measured after trimming", () => {
    const db = open();
    const { created } = addApplication(db, { text: `  ${"x".repeat(200_000)}  ` });
    expect(created).toBe(true);
  });

  test.each<[string, unknown]>([
    ["Application must be an object", []],
    ["text must be a non-empty string", { text: "  " }],
    ["text must be a non-empty string", { text: 42 }],
    ["text is over 200000 characters", { text: "x".repeat(200_001) }],
    ["link must be a URL", { text: "Job", link: 42 }],
    ["link must be a URL", { text: "Job", link: "not a url" }],
    ["link must be http or https", { text: "Job", link: "javascript:alert(1)" }],
    ["link must be http or https", { text: "Job", link: "ftp://acme.com/job" }],
    ["pay_low must not exceed pay_high", { text: "Job", pay_low: 50, pay_high: 40 }],
    ["pay_low must be a non-negative number", { text: "Job", pay_low: "40" }],
    ["unknown field description", { text: "Job", description: "Job" }],
  ])("rejects with '%s' and writes nothing", (message, body) => {
    const db = open();
    expect(() => addApplication(db, body)).toThrow(message);
    expect(countOf(db)).toBe(0);
  });
});

describe("listApplications", () => {
  test("lists newest first with each application's events oldest first", () => {
    const db = open();
    const older = addApplication(db, { text: "Old job" }).id;
    const newer = addApplication(db, { text: "New job" }).id;
    db.run("INSERT INTO status_events (application_id, status, at) VALUES (?, 'interview', '2026-02-01T00:00:00.000Z')", [older]);
    db.run("INSERT INTO status_events (application_id, status, at) VALUES (?, 'sent', '2026-01-01T00:00:00.000Z')", [older]);

    const [first, second] = listApplications(db);
    expect(first).toMatchObject({ id: newer, events: [] });
    expect(second.events.map(({ status, at }) => ({ status, at }))).toEqual([
      { status: "sent", at: "2026-01-01T00:00:00.000Z" },
      { status: "interview", at: "2026-02-01T00:00:00.000Z" },
    ]);
  });

  test("events on the same millisecond keep the order they were recorded in", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    db.run("INSERT INTO status_events (application_id, status, at) VALUES (?, 'sent', '2026-01-01T00:00:00.000Z')", [id]);
    db.run("INSERT INTO status_events (application_id, status, at) VALUES (?, 'rejected', '2026-01-01T00:00:00.000Z')", [id]);
    expect(listApplications(db)[0].events.map((event) => event.status)).toEqual(["sent", "rejected"]);
  });

  test("returns contacts parsed and cover_letter_sent as a boolean", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    updateApplication(db, id, { contacts: [{ name: "Ada", email: "ada@acme.com" }], cover_letter_sent: true });
    expect(listApplications(db)[0]).toMatchObject({ contacts: [{ name: "Ada", email: "ada@acme.com" }], cover_letter_sent: true });
  });
});

describe("updateApplication", () => {
  test("returns the application with its events, oldest first", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    const sent = addStatusEvent(db, id, { status: "sent", at: "2026-01-01T00:00:00.000Z" })!;
    const interview = addStatusEvent(db, id, { status: "interview" })!;

    expect(updateApplication(db, id, { company: "Acme" })?.application.events).toEqual([sent, interview]);
  });

  test("reports the fields it applied", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    expect(updateApplication(db, id, { company: "Acme", pay_low: 40 })?.fields).toEqual(["company", "pay_low"]);
    expect(updateApplication(db, id, {})?.fields).toEqual([]);
  });

  test("changes only the fields in the body", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job", link: "https://acme.com/1" });
    updateApplication(db, id, { company: "Acme", location: "Austin", pay_low: 40 });

    const updated = updateApplication(db, id, { company: " Acme Corp ", pay_unit: "hour" })?.application;
    expect(updated).toMatchObject({ company: "Acme Corp", location: "Austin", pay_low: 40, pay_unit: "hour", link: "https://acme.com/1" });
  });

  test("rejects pay_low above the stored pay_high and writes nothing", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    updateApplication(db, id, { pay_high: 40 });
    const before = listApplications(db);
    expect(() => updateApplication(db, id, { company: "Acme", pay_low: 50 })).toThrow("pay_low must not exceed pay_high");
    expect(listApplications(db)).toEqual(before);
  });

  test("null or blank text clears a field", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    updateApplication(db, id, { company: "Acme", notes: "Call back" });
    expect(updateApplication(db, id, { company: null, notes: "  " })?.application).toMatchObject({ company: null, notes: null });
  });

  test("drops blank contact fields and contacts left empty", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    const updated = updateApplication(db, id, { contacts: [{ name: " Ada ", phone: "" }, { email: " " }] })?.application;
    expect(updated?.contacts).toEqual([{ name: "Ada" }]);
  });

  test("returns null for a missing application", () => {
    expect(updateApplication(open(), 99, { company: "Acme" })).toBeNull();
  });

  test("rejects a body that is not an object", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    expect(() => updateApplication(db, id, [])).toThrow("Application must be an object");
  });

  test.each<[string, object]>([
    ["company must be a string", { company: 42 }],
    ["pay_low must be a non-negative number", { pay_low: "40" }],
    ["pay_high must be a non-negative number", { pay_high: -1 }],
    ["pay_unit must be one of hour, month, year", { pay_unit: "week" }],
    ["location_type must be one of in_person, hybrid, remote, unknown", { location_type: "onsite" }],
    ["cover_letter must be one of required, optional, none", { cover_letter: "maybe" }],
    ["cover_letter_sent must be true or false", { cover_letter_sent: 1 }],
    ["contacts must be a list", { contacts: { name: "Ada" } }],
    ["Contact must be an object", { contacts: ["Ada"] }],
    ["contact email must be a string", { contacts: [{ email: 42 }] }],
    ["unknown field description", { description: "Edited" }],
    ["unknown field link", { link: "https://acme.com/2" }],
    ["pay_low must not exceed pay_high", { pay_low: 50, pay_high: 40 }],
  ])("rejects with '%s' and writes none of the valid fields beside it", (message, body) => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    const before = listApplications(db);
    expect(() => updateApplication(db, id, { notes: "Call back", ...body })).toThrow(message);
    expect(listApplications(db)).toEqual(before);
  });
});

describe("addStatusEvent", () => {
  test("records the status stamped now", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    const event = addStatusEvent(db, id, { status: "sent" });
    expect(event?.status).toBe("sent");
    expect(Date.now() - Date.parse(event!.at)).toBeLessThan(5_000);
    expect(listApplications(db)[0].events).toEqual([event!]);
  });

  test("backdates to the given time, stored in UTC ISO form", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    const event = addStatusEvent(db, id, { status: "sent", at: "2026-10-28T12:00:00-07:00" });
    expect(event?.at).toBe("2026-10-28T19:00:00.000Z");
  });

  test("returns null for a missing application", () => {
    const db = open();
    expect(addStatusEvent(db, 99, { status: "sent" })).toBeNull();
    expect(eventCountOf(db)).toBe(0);
  });

  test.each<[string, string, unknown]>([
    ["a non-object body", "Status event must be an object", null],
    ["an unknown status", "status must be one of sent, interview_invite, interview, offer, rejected, withdrawn", { status: "ghosted" }],
    ["a missing status", "status must be one of sent, interview_invite, interview, offer, rejected, withdrawn", {}],
    ["an unparseable time", "at must be an ISO timestamp", { status: "sent", at: "last week" }],
    ["a US-style date", "at must be an ISO timestamp", { status: "sent", at: "10/28/2026" }],
    ["a date with no time", "at must be an ISO timestamp", { status: "sent", at: "2026-10-28" }],
    ["a time with no offset", "at must be an ISO timestamp", { status: "sent", at: "2026-10-28T12:00" }],
    ["a non-string time", "at must be an ISO timestamp", { status: "sent", at: 1_700_000_000_000 }],
    ["a future time", "at must not be in the future", { status: "sent", at: new Date(Date.now() + 60_000).toISOString() }],
  ])("rejects %s and writes nothing", (_case, message, body) => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    expect(() => addStatusEvent(db, id, body)).toThrow(message);
    expect(eventCountOf(db)).toBe(0);
  });
});

describe("deleteStatusEvent", () => {
  test("deletes the last recorded event, leaving the earlier ones", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    const sent = addStatusEvent(db, id, { status: "sent" })!;
    const misclick = addStatusEvent(db, id, { status: "rejected" })!;

    expect(deleteStatusEvent(db, id, misclick.id)).toEqual(misclick);
    expect(listApplications(db)[0].events).toEqual([sent]);
  });

  test("deletes a backdated event when it was recorded last", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    addStatusEvent(db, id, { status: "interview" });
    const backdated = addStatusEvent(db, id, { status: "sent", at: "2026-01-01T00:00:00.000Z" })!;

    expect(deleteStatusEvent(db, id, backdated.id)).toEqual(backdated);
  });

  test("undoes repeatedly, each time the newest remaining event", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    const sent = addStatusEvent(db, id, { status: "sent" })!;
    const interview = addStatusEvent(db, id, { status: "interview" })!;

    expect(deleteStatusEvent(db, id, interview.id)).toEqual(interview);
    expect(deleteStatusEvent(db, id, sent.id)).toEqual(sent);
    expect(eventCountOf(db)).toBe(0);
  });

  test("a stale undo refuses once a new event took the undone event's place", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    const misclick = addStatusEvent(db, id, { status: "rejected" })!;
    deleteStatusEvent(db, id, misclick.id);
    const interview = addStatusEvent(db, id, { status: "interview" })!;

    expect(interview.id).not.toBe(misclick.id);
    expect(deleteStatusEvent(db, id, misclick.id)).toBe("missing");
    expect(listApplications(db)[0].events).toEqual([interview]);
  });

  test("refuses an older event and keeps it", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    const sent = addStatusEvent(db, id, { status: "sent" })!;
    addStatusEvent(db, id, { status: "interview" });

    expect(deleteStatusEvent(db, id, sent.id)).toBe("not_last_recorded");
    expect(eventCountOf(db)).toBe(2);
  });

  test("reports an event that belongs to another application as missing", () => {
    const db = open();
    const first = addApplication(db, { text: "First job" }).id;
    const second = addApplication(db, { text: "Second job" }).id;
    const event = addStatusEvent(db, first, { status: "sent" })!;

    expect(deleteStatusEvent(db, second, event.id)).toBe("missing");
    expect(eventCountOf(db)).toBe(1);
  });

  test("reports a nonexistent event as missing", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    expect(deleteStatusEvent(db, id, 99)).toBe("missing");
  });
});
