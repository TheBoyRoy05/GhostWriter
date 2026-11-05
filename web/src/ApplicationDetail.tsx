import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { sendJson } from "@/lib/api";
import { amountOf, labelOf, slugOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CONTACT_FIELDS, COVER_LETTERS, LOCATION_TYPES, PAY_UNITS, type Application, type Contact } from "../../shared/applications";
import Field, { errorIdOf } from "./Field";
import StatusRoute from "./StatusRoute";

type TextKey = "company" | "position_title" | "location" | "start_date" | "deadline" | "req_id";
type PayKey = "pay_low" | "pay_high";
type ChoiceKey = "pay_unit" | "location_type" | "cover_letter";
type ContactField = (typeof CONTACT_FIELDS)[number];
type Editable = Omit<Application, "id" | "events" | "link" | "source">;
// Pay stays the typed text until save, so a half-typed or stray keystroke never clears the stored number.
type Draft = Omit<Editable, PayKey> & Record<PayKey, string>;

const DATA_FIELDS: ReadonlySet<TextKey> = new Set(["req_id", "deadline"]);

const CONTACT_INPUTS: Record<ContactField, { label: string; type: string }> = {
  name: { label: "Name", type: "text" },
  role: { label: "Role", type: "text" },
  email: { label: "Email", type: "email" },
  phone: { label: "Phone", type: "tel" },
  linkedin: { label: "LinkedIn", type: "url" },
};

export default function ApplicationDetail({
  application,
  notice,
  onChange,
}: {
  application: Application;
  notice?: string;
  onChange: () => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(() => draftOf(application));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Focus refetches replace the prop, so diffing against it would revert fields changed elsewhere since mount.
  const saved = useRef(editableOf(application));
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => heading.current?.focus(), []);

  const pay = { pay_low: amountOf(draft.pay_low), pay_high: amountOf(draft.pay_high) };
  const payInvalid = Number.isNaN(pay.pay_low) || Number.isNaN(pay.pay_high);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const edited: Editable = { ...draft, ...pay };
    const changed = Object.entries(edited).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(saved.current[key as keyof Editable]),
    );
    const result = await sendJson("PATCH", `/api/applications/${application.id}`, Object.fromEntries(changed));

    setSaving(false);
    if (!result.ok) return setError(result.error);
    saved.current = editableOf(await result.res.json());
    toast("Saved");
    await onChange();
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setContacts = (change: (contacts: Contact[]) => Contact[]) => setDraft((d) => ({ ...d, contacts: change(d.contacts) }));

  const textInput = (key: TextKey, label: string, type = "text") => (
    <Field id={`application-${key}`} label={label}>
      <Input
        id={`application-${key}`}
        type={type}
        className={cn(DATA_FIELDS.has(key) && "font-mono")}
        value={draft[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
      />
    </Field>
  );

  const payInput = (key: PayKey, label: string) => {
    const id = `application-${key}`;
    const invalid = Number.isNaN(pay[key]);
    return (
      <Field id={id} label={label} error={invalid ? "Must be a number" : undefined}>
        <Input
          id={id}
          inputMode="decimal"
          className="font-mono"
          aria-invalid={invalid}
          aria-describedby={invalid ? errorIdOf(id) : undefined}
          value={draft[key]}
          onChange={(e) => set(key, e.target.value)}
        />
      </Field>
    );
  };

  const choiceInput = (key: ChoiceKey, label: string, options: readonly string[]) => (
    <Field id={`application-${key}`} label={label}>
      <NativeSelect
        id={`application-${key}`}
        className="w-full"
        value={draft[key] ?? ""}
        onChange={(e) => set(key, (e.target.value || null) as Draft[ChoiceKey])}
      >
        <NativeSelectOption value="">Not set</NativeSelectOption>
        {options.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {labelOf(option)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );

  return (
    <form onSubmit={save} className="flex min-h-full flex-col bg-panel">
      <div className="grid gap-6 p-6">
        <header className="grid gap-1">
          <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">
            {application.company ?? "Untitled application"}
          </h2>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {application.position_title && <p>{application.position_title}</p>}
            {application.link && (
              <a className="flex items-center gap-1 text-signal underline-offset-4 hover:underline" href={application.link} target="_blank" rel="noreferrer">
                Job posting
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
          </div>
        </header>

        {notice && (
          <p role="status" className="border-l-2 border-ink pl-3">
            {notice}
          </p>
        )}

        <StatusRoute application={application} onChange={onChange} />

        <FieldGroup title="Role">
          {textInput("company", "Company")}
          {textInput("position_title", "Position title")}
          {textInput("req_id", "Req ID")}
        </FieldGroup>
        <FieldGroup title="Pay">
          {payInput("pay_low", "Low")}
          {payInput("pay_high", "High")}
          {choiceInput("pay_unit", "Per", PAY_UNITS)}
        </FieldGroup>
        <FieldGroup title="Where">
          {textInput("location", "Location")}
          {choiceInput("location_type", "Type", LOCATION_TYPES)}
        </FieldGroup>
        <FieldGroup title="When">
          {textInput("start_date", "Start date")}
          {textInput("deadline", "Deadline", "date")}
        </FieldGroup>
        <FieldGroup title="Cover">
          {choiceInput("cover_letter", "Cover letter", COVER_LETTERS)}
          {draft.cover_letter !== "none" && (
            <div className="flex items-center gap-2 self-end pb-2">
              <Checkbox
                id="application-cover_letter_sent"
                checked={draft.cover_letter_sent}
                onCheckedChange={(checked) => set("cover_letter_sent", checked === true)}
              />
              <Label htmlFor="application-cover_letter_sent">Sent</Label>
            </div>
          )}
        </FieldGroup>

        <FieldGroup title="Contacts" columns={1}>
          {draft.contacts.map((contact, index) => (
            <div key={index} className="grid gap-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Contact {index + 1}</h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove contact ${index + 1}`}
                  onClick={() => setContacts((contacts) => contacts.filter((_, i) => i !== index))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {CONTACT_FIELDS.map((field) => (
                  <Field key={field} id={`contact-${index}-${field}`} label={CONTACT_INPUTS[field].label}>
                    <Input
                      id={`contact-${index}-${field}`}
                      type={CONTACT_INPUTS[field].type}
                      value={contact[field] ?? ""}
                      onChange={(e) =>
                        setContacts((contacts) => contacts.map((old, i) => (i === index ? { ...old, [field]: e.target.value } : old)))
                      }
                    />
                  </Field>
                ))}
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" className="justify-self-start" onClick={() => setContacts((contacts) => [...contacts, {}])}>
            <Plus aria-hidden />
            Add contact
          </Button>
        </FieldGroup>

        <FieldGroup title="Notes" columns={1}>
          <Textarea aria-label="Notes" className="min-h-24" value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </FieldGroup>
      </div>

      <footer className="sticky bottom-0 mt-auto flex flex-wrap items-center justify-end gap-4 border-t bg-panel px-6 py-3">
        {error && (
          <p role="alert" className="mr-auto text-sm text-fault">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={saving || payInvalid}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </footer>
    </form>
  );
}

function FieldGroup({ title, columns = 3, children }: { title: string; columns?: 1 | 3; children: ReactNode }) {
  const id = `group-${slugOf(title)}`;
  return (
    <div role="group" aria-labelledby={id} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4">
      <h3 id={id} className={cn("font-semibold", columns === 3 && "pt-6")}>
        {title}
      </h3>
      <div className={columns === 3 ? "grid grid-cols-3 gap-3" : "grid gap-3"}>{children}</div>
    </div>
  );
}

function editableOf({ id: _id, events: _events, link: _link, source: _source, ...fields }: Application): Editable {
  return fields;
}

function draftOf(application: Application): Draft {
  const { pay_low, pay_high, ...fields } = editableOf(application);
  return { ...fields, pay_low: pay_low?.toString() ?? "", pay_high: pay_high?.toString() ?? "" };
}
