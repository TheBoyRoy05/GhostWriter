import { describe, expect, setSystemTime, test } from "bun:test";
import { localDay } from "@/lib/format";
import { eventAt, groupApplications, lastRecordedEvent, routeOf } from "@/lib/status";
import type { Application, Status, StatusEvent } from "../../../shared/applications";

const event = (id: number, status: Status, at: string): StatusEvent => ({ id, status, at });

const application = (id: number, events: StatusEvent[]) => ({ id, events }) as Application;

describe("routeOf", () => {
  test("an unsent application is all road ahead", () => {
    expect(routeOf([])).toEqual({ ahead: 4, closed: false });
  });

  test("road ahead counts the forward stops past the furthest one reached", () => {
    const events = [event(1, "sent", "2026-10-21T12:00:00Z"), event(2, "interview", "2026-11-02T12:00:00Z")];
    expect(routeOf(events)).toMatchObject({ ahead: 1, closed: false });
  });

  test("an offer ends the route", () => {
    expect(routeOf([event(1, "offer", "2026-11-02T12:00:00Z")])).toMatchObject({ ahead: 0, closed: false });
  });

  test("a rejection closes the route with no road ahead", () => {
    const events = [event(1, "sent", "2026-10-21T12:00:00Z"), event(2, "rejected", "2026-10-30T12:00:00Z")];
    expect(routeOf(events)).toMatchObject({ ahead: 0, closed: true });
  });

  test("a later stop after a rejection reopens the route", () => {
    const events = [event(1, "rejected", "2026-10-21T12:00:00Z"), event(2, "interview", "2026-10-30T12:00:00Z")];
    expect(routeOf(events)).toMatchObject({ ahead: 1, closed: false });
  });
});

describe("groupApplications", () => {
  test("groups by latest status in route order, newest status first, empty groups dropped", () => {
    const groups = groupApplications([
      application(1, []),
      application(2, [event(1, "sent", "2026-10-20T12:00:00Z")]),
      application(3, [event(2, "sent", "2026-10-28T12:00:00Z"), event(3, "interview", "2026-11-02T12:00:00Z")]),
      application(4, [event(4, "sent", "2026-10-25T12:00:00Z")]),
      application(5, [event(5, "withdrawn", "2026-10-22T12:00:00Z")]),
    ]);

    expect(groups.map((group) => [group.name, group.applications.map((a) => a.id)])).toEqual([
      ["Not sent", [1]],
      ["Waiting", [4, 2]],
      ["Talking", [3]],
      ["Closed", [5]],
    ]);
  });
});

describe("lastRecordedEvent", () => {
  test("picks the highest id even when a backdated event sorts earlier", () => {
    const events = [event(7, "sent", "2026-10-01T12:00:00Z"), event(3, "interview_invite", "2026-10-10T12:00:00Z")];
    expect(lastRecordedEvent(events)?.id).toBe(7);
  });

  test("is undefined without events", () => {
    expect(lastRecordedEvent([])).toBeUndefined();
  });
});

describe("eventAt", () => {
  test("today and an empty date leave the stamp to the server", () => {
    expect(eventAt(localDay(new Date()))).toBeUndefined();
    expect(eventAt("")).toBeUndefined();
  });

  test("today is read at call time, so a date picked before midnight is stamped after it", () => {
    setSystemTime(new Date(2026, 10, 3, 23, 50));
    expect(eventAt("2026-11-03")).toBeUndefined();

    setSystemTime(new Date(2026, 10, 4, 0, 10));
    expect(localDay(new Date(eventAt("2026-11-03")!))).toBe("2026-11-03");

    setSystemTime();
  });

  test("a past date stamps local noon of that day", () => {
    const at = new Date(eventAt("2026-10-21")!);
    expect([localDay(at), at.getHours(), at.getMinutes()]).toEqual(["2026-10-21", 12, 0]);
  });
});
