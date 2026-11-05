import { localDay } from "@/lib/format";
import type { Application, Status, StatusEvent } from "../../../shared/applications";

export type GroupName = "Not sent" | "Waiting" | "Talking" | "Offers" | "Closed";
export type RouteLine = { ahead: number; closed: boolean };

export const STATUS_NAMES: Record<Status, string> = {
  sent: "Sent",
  interview_invite: "Invite",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const GROUP_ORDER: GroupName[] = ["Not sent", "Waiting", "Talking", "Offers", "Closed"];

const GROUP_OF: Record<Status, GroupName> = {
  sent: "Waiting",
  interview_invite: "Talking",
  interview: "Talking",
  offer: "Offers",
  rejected: "Closed",
  withdrawn: "Closed",
};

const FORWARD_STOPS: Status[] = ["sent", "interview_invite", "interview", "offer"];
const CLOSING_STATUSES: Status[] = ["rejected", "withdrawn"];

export const isClosing = (status: Status) => CLOSING_STATUSES.includes(status);

export const latestEvent = (application: Application) => application.events.at(-1);

// The server only lets the most recently recorded event be deleted, which is the highest id, not the latest date.
export const lastRecordedEvent = (events: StatusEvent[]) =>
  events.reduce<StatusEvent | undefined>((last, event) => (!last || event.id > last.id ? event : last), undefined);

export function groupApplications(applications: Application[]) {
  const groups = new Map<GroupName, Application[]>(GROUP_ORDER.map((name) => [name, []]));
  for (const application of applications) {
    const status = latestEvent(application)?.status;
    groups.get(status ? GROUP_OF[status] : "Not sent")!.push(application);
  }

  return GROUP_ORDER.map((name) => ({ name, applications: groups.get(name)!.sort(newestFirst) })).filter(
    (group) => group.applications.length > 0,
  );
}

export function routeOf(events: StatusEvent[]): RouteLine {
  const last = events.at(-1)?.status;
  const closed = last !== undefined && isClosing(last);
  if (closed || last === "offer") return { ahead: 0, closed };

  const furthest = Math.max(-1, ...events.map((event) => FORWARD_STOPS.indexOf(event.status)));
  return { ahead: FORWARD_STOPS.length - 1 - furthest, closed };
}

// Today omits `at` so the server stamps now; local noon on today could still be in the future and get a 400.
export function eventAt(day: string) {
  if (!day || day === localDay(new Date())) return undefined;
  return new Date(`${day}T12:00`).toISOString();
}

function newestFirst(a: Application, b: Application) {
  const byDate = (latestEvent(b)?.at ?? "").localeCompare(latestEvent(a)?.at ?? "");
  return byDate || b.id - a.id;
}
