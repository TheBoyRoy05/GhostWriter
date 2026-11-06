import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { request, sendJson } from "@/lib/api";
import { amountOf, labelOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import { COVER_LETTERS, PAY_UNITS, type Application, type ExtractedFields, type Extraction } from "../../shared/applications";
import type { AddedState } from "./ApplicationList";
import Field, { errorIdOf } from "./Field";
import { saveDraft, type Draft } from "./ResumeView";

type Fields = Record<keyof ExtractedFields | "link", string>;
type PayKey = "pay_low" | "pay_high";
type ChoiceKey = "pay_unit" | "cover_letter";
type Posting = { state: "loading" } | { state: "failed"; error: string } | { state: "loaded" };
type Resume = { job: string } & ({ state: "writing" } | { state: "written"; latex: string; warning?: string } | { state: "failed"; error: string });

const PAY_GROUP = ["pay_low", "pay_high", "pay_unit"] as const;

const NO_FIELDS: Fields = {
  company: "",
  position_title: "",
  pay_low: "",
  pay_high: "",
  pay_unit: "",
  location: "",
  req_id: "",
  deadline: "",
  cover_letter: "",
  link: "",
};

export default function NewApplication() {
  const [, navigate] = useLocation();
  const [posting, setPosting] = useState<Posting>({ state: "loading" });
  const [text, setText] = useState("");
  const [fields, setFields] = useState(NO_FIELDS);
  const [resume, setResume] = useState<Resume>();
  const [extractingJob, setExtractingJob] = useState<string>();
  const [extractError, setExtractError] = useState<{ job: string; message: string }>();
  const [applications, setApplications] = useState<Application[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // A result written from superseded text must not replace the current one.
  const latestJob = useRef<string>(undefined);
  // The JSON-LD describes only the text it was captured with, never an edit or paste.
  const captured = useRef<{ job: string; jobPosting: unknown }>(undefined);
  // Read by extract() after its await, when the `text` it closed over may be stale.
  const textRef = useRef("");
  const extractedJob = useRef<string>(undefined);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    let unmounted = false;

    Promise.all([request("/api/job"), request("/api/job-posting")]).then(async ([result, postingResult]) => {
      if (unmounted) return;
      if (!result.ok) return setPosting({ state: "failed", error: result.error });

      const job = await result.res.text();
      // Without the JSON-LD posting the model reads every field from the text, so losing it is not fatal.
      captured.current = { job, jobPosting: postingResult.ok ? await postingResult.res.json() : null };
      setPosting({ state: "loaded" });
      setText(job);
      setFields((f) => ({ ...f, link: f.link || linkOf(job) }));
      if (job.trim()) write(job);
    });

    request("/api/applications").then(async (result) => {
      if (unmounted || !result.ok) return;
      setApplications(await result.res.json());
    });

    return () => {
      unmounted = true;
    };
  }, []);

  async function write(job: string) {
    latestJob.current = job;
    setResume({ job, state: "writing" });
    extract(job);
    const result = await sendJson("POST", "/api/generate", { job });
    if (latestJob.current !== job) return;
    if (!result.ok) return setResume({ job, state: "failed", error: result.error });

    const written: Draft & { warning?: string } = await result.res.json();
    if (latestJob.current !== job) return;
    setResume({ job, state: "written", latex: written.latex, warning: written.warning });
  }

  async function extract(job: string) {
    // A resume retry on the same text would spend a second model call that can 429 over filled fields.
    if (extractedJob.current === job) return;
    extractedJob.current = job;
    setExtractingJob(job);
    setExtractError(undefined);
    const jobPosting = captured.current?.job === job ? captured.current.jobPosting : null;

    const result = await sendJson("POST", "/api/extract", { text: job, jobPosting });
    const { fields: extracted, error }: Partial<Extraction> = result.ok ? await result.res.json() : { error: result.error };
    setExtractingJob((j) => (j === job ? undefined : j));

    const dropped = textRef.current !== job;
    // Nothing was filled from this text, so the next Write resume on it extracts again.
    if ((dropped || !result.ok) && extractedJob.current === job) extractedJob.current = undefined;
    if (dropped) return console.info("extraction dropped: the posting text changed while it ran");
    if (extracted) setFields((f) => prefilled(f, extracted));
    if (error) setExtractError({ job, message: error });
  }

  const current = resume?.job === text ? resume : undefined;
  const pay = { pay_low: amountOf(fields.pay_low), pay_high: amountOf(fields.pay_high) };
  const payInvalid = Number.isNaN(pay.pay_low) || Number.isNaN(pay.pay_high);
  const canAdd = !saving && !payInvalid && text.trim() !== "";
  const progress = progressOf(posting, text, current);
  const repost = applications.find((a) => sameText(a.company, fields.company) && sameText(a.position_title, fields.position_title));

  async function confirm(latex?: string) {
    setSaving(true);
    setError("");

    const choices = { pay_unit: fields.pay_unit || null, cover_letter: fields.cover_letter || null };
    const result = await sendJson("POST", "/api/applications", { text, ...fields, ...pay, ...choices });
    if (!result.ok) {
      setSaving(false);
      return setError(result.error);
    }

    const { id, created } = (await result.res.json()) as { id: number; created: boolean };
    if (!created) return navigate(`/applications/${id}`, { state: { alreadyTracked: true } satisfies AddedState });
    if (latex === undefined) return navigate(`/applications/${id}`);
    saveDraft({ latex, company: fields.company, role: fields.position_title });
    navigate("/");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (current?.state === "written") confirm(current.latex);
  }

  const set = (key: keyof Fields, value: string) => setFields((f) => ({ ...f, [key]: value }));

  const textInput = (key: Exclude<keyof Fields, PayKey | ChoiceKey>, label: string, type = "text") => (
    <Field id={`new-${key}`} label={label}>
      <Input id={`new-${key}`} type={type} className={cn(type === "date" && "font-mono")} value={fields[key]} onChange={(e) => set(key, e.target.value)} />
    </Field>
  );

  const payInput = (key: PayKey, label: string) => {
    const id = `new-${key}`;
    const invalid = Number.isNaN(pay[key]);
    return (
      <Field id={id} label={label} error={invalid ? "Must be a number" : undefined}>
        <Input
          id={id}
          inputMode="decimal"
          className="font-mono"
          aria-invalid={invalid}
          aria-describedby={invalid ? errorIdOf(id) : undefined}
          value={fields[key]}
          onChange={(e) => set(key, e.target.value)}
        />
      </Field>
    );
  };

  const choiceInput = (key: ChoiceKey, label: string, options: readonly string[]) => (
    <Field id={`new-${key}`} label={label}>
      <NativeSelect id={`new-${key}`} className="w-full" value={fields[key]} onChange={(e) => set(key, e.target.value)}>
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
    <form onSubmit={submit} className="grid h-full grid-cols-[minmax(0,1fr)_28rem]">
      <section aria-labelledby="new-text-label" className="flex min-h-0 flex-col gap-3 p-6">
        <h1 id="new-text-label" className="text-2xl font-semibold">
          New application
        </h1>
        <Textarea
          aria-label="Posting"
          className="min-h-0 flex-1 resize-none [field-sizing:fixed]"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </section>

      <section aria-label="Application" className="flex min-h-0 flex-col border-l bg-panel">
        <div className="grid flex-1 content-start gap-4 overflow-y-auto p-6">
          <p role="status" className={cn("border-l-2 pl-3", progress.error ? "border-fault text-fault" : "border-signal")}>
            {progress.text}
          </p>
          {text.trim() && (!current || current.state === "failed") && (
            <Button type="button" variant="outline" className="justify-self-start" disabled={saving} onClick={() => write(text)}>
              Write resume
            </Button>
          )}
          {extractingJob !== undefined && <p className="text-sm text-dim">Filling fields…</p>}
          {extractError?.job === text && <p className="text-sm text-fault">Could not fill the fields: {extractError.message}</p>}
          {textInput("company", "Company")}
          {textInput("position_title", "Position title")}
          {repost && (
            <p role="note" className="border-l-2 border-ink pl-3">
              You already track this company and title, maybe from another link.{" "}
              <Link className="text-signal underline-offset-4 hover:underline" href={`/applications/${repost.id}`}>
                Open it
              </Link>
            </p>
          )}
          {textInput("req_id", "Req ID")}
          <div className="grid grid-cols-3 gap-3">
            {payInput("pay_low", "Pay low")}
            {payInput("pay_high", "Pay high")}
            {choiceInput("pay_unit", "Per", PAY_UNITS)}
          </div>
          {textInput("location", "Location")}
          {textInput("deadline", "Deadline", "date")}
          {choiceInput("cover_letter", "Cover letter", COVER_LETTERS)}
          {textInput("link", "Link", "url")}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t px-6 py-3">
          {error && (
            <p role="alert" className="mr-auto text-sm text-fault">
              {error}
            </p>
          )}
          <Button variant="outline" size="lg" asChild>
            <Link href="/applications">Cancel</Link>
          </Button>
          {current?.state === "failed" && (
            <Button type="button" variant="outline" size="lg" disabled={!canAdd} onClick={() => confirm()}>
              Confirm without resume
            </Button>
          )}
          <Button type="submit" size="lg" disabled={!canAdd || current?.state !== "written"}>
            {current?.state === "writing" ? "Writing…" : saving ? "Adding…" : "Confirm"}
          </Button>
        </footer>
      </section>
    </form>
  );
}

export function progressOf(posting: Posting, text: string, resume: Resume | undefined) {
  if (posting.state === "loading") return { text: "Loading the posting…" };
  if (!text.trim() && posting.state === "failed") return { text: posting.error, error: true };
  if (!text.trim()) return { text: "No posting captured. Send one from the extension, or paste it here." };
  if (!resume) return { text: "Write the resume for this posting before confirming." };
  if (resume.state === "writing") return { text: "Writing the resume…" };
  if (resume.state === "failed") return { text: `Writing failed: ${resume.error}`, error: true };
  if (resume.warning) return { text: `${resume.warning}. Confirm to open it.`, error: true };
  return { text: "Resume written. Confirm to open it." };
}

function prefilled(fields: Fields, extracted: ExtractedFields): Fields {
  // A range mixed from typed and extracted values can come out inverted or in the wrong unit.
  const payTyped = PAY_GROUP.some((key) => fields[key] !== "");
  const filled = Object.entries(extracted)
    .filter(([key]) => !(payTyped && (PAY_GROUP as readonly string[]).includes(key)))
    .map(([key, value]) => [key, fields[key as keyof ExtractedFields] || (value === null ? "" : String(value))]);
  return { ...fields, ...Object.fromEntries(filled) };
}

const sameText = (stored: string | null, typed: string) => typed.trim() !== "" && stored?.trim().toLowerCase() === typed.trim().toLowerCase();

// The extension puts the page's URL on the posting's first line.
function linkOf(job: string) {
  const url = URL.parse(job.split("\n", 1)[0].trim());
  return url?.protocol === "http:" || url?.protocol === "https:" ? url.href : "";
}
