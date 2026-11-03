import { describe, expect, test } from "bun:test";
import { openDatabase } from "./db";
import { addApplication, addStatusEvent, listApplications, updateApplication } from "./applications";

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
  ])("rejects with '%s' and writes nothing", (message, body) => {
    const db = open();
    expect(() => addApplication(db, body)).toThrow(message);
    expect(countOf(db)).toBe(0);
  });
});

describe("listApplications", () => {
  test("lists newest first with the latest status event as the current status", () => {
    const db = open();
    const older = addApplication(db, { text: "Old job" }).id;
    const newer = addApplication(db, { text: "New job" }).id;
    db.run("INSERT INTO status_events (application_id, status, at) VALUES (?, 'interview', '2026-02-01T00:00:00.000Z')", [older]);
    db.run("INSERT INTO status_events (application_id, status, at) VALUES (?, 'sent', '2026-01-01T00:00:00.000Z')", [older]);

    const [first, second] = listApplications(db);
    expect(first).toMatchObject({ id: newer, status: null, status_at: null });
    expect(second).toMatchObject({ id: older, status: "interview", status_at: "2026-02-01T00:00:00.000Z" });
  });

  test("a later event on the same millisecond still becomes the current status", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    db.run("INSERT INTO status_events (application_id, status, at) VALUES (?, 'sent', '2026-01-01T00:00:00.000Z')", [id]);
    db.run("INSERT INTO status_events (application_id, status, at) VALUES (?, 'rejected', '2026-01-01T00:00:00.000Z')", [id]);
    expect(listApplications(db)[0].status).toBe("rejected");
  });

  test("returns contacts parsed and cover_letter_sent as a boolean", () => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    updateApplication(db, id, { contacts: [{ name: "Ada", email: "ada@acme.com" }], cover_letter_sent: true });
    expect(listApplications(db)[0]).toMatchObject({ contacts: [{ name: "Ada", email: "ada@acme.com" }], cover_letter_sent: true });
  });
});

describe("updateApplication", () => {
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
    expect(listApplications(db)[0]).toMatchObject({ status: "sent", status_at: event!.at });
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
  ])("rejects %s and writes nothing", (_case, message, body) => {
    const db = open();
    const { id } = addApplication(db, { text: "Job" });
    expect(() => addStatusEvent(db, id, body)).toThrow(message);
    expect(eventCountOf(db)).toBe(0);
  });
});
