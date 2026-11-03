// These mirror the CHECK constraints on the applications table in server/migrations/0001_init.sql.
export const PAY_UNITS = ["hour", "month", "year"] as const;
export const LOCATION_TYPES = ["in_person", "hybrid", "remote", "unknown"] as const;
export const COVER_LETTERS = ["required", "optional", "none"] as const;
export const SOURCES = ["simplify", "linkedin", "website"] as const;

// status_events.status has no CHECK, so addStatusEvent is the only guard on this list.
export const STATUSES = ["sent", "interview_invite", "interview", "offer", "rejected", "withdrawn"] as const;
export const CONTACT_FIELDS = ["name", "role", "email", "phone", "linkedin"] as const;

export type Source = (typeof SOURCES)[number];
export type Status = (typeof STATUSES)[number];
export type StatusEvent = { id: number; status: Status; at: string };
export type Contact = Partial<Record<(typeof CONTACT_FIELDS)[number], string>>;

export type Application = {
  id: number;
  company: string | null;
  position_title: string | null;
  pay_low: number | null;
  pay_high: number | null;
  pay_unit: (typeof PAY_UNITS)[number] | null;
  location: string | null;
  location_type: (typeof LOCATION_TYPES)[number] | null;
  start_date: string | null;
  cover_letter: (typeof COVER_LETTERS)[number] | null;
  cover_letter_sent: boolean;
  link: string | null;
  source: Source | null;
  req_id: string | null;
  deadline: string | null;
  contacts: Contact[];
  notes: string | null;
  status: Status | null;
  status_at: string | null;
};
