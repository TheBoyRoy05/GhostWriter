import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { request, sendJson } from "@/lib/api";
import { amountOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AddedState } from "./ApplicationList";
import Field, { errorIdOf } from "./Field";
import { saveDraft, type Draft } from "./ResumeView";

type Fields = Record<"company" | "position_title" | "pay_low" | "pay_high" | "location" | "deadline" | "link", string>;
type PayKey = "pay_low" | "pay_high";
type Posting = { state: "loading" } | { state: "failed"; error: string } | { state: "loaded" };
type Resume = { job: string } & ({ state: "writing" } | { state: "written"; latex: string } | { state: "failed"; error: string });

const NO_FIELDS: Fields = { company: "", position_title: "", pay_low: "", pay_high: "", location: "", deadline: "", link: "" };

export default function NewApplication() {
  const [, navigate] = useLocation();
  const [posting, setPosting] = useState<Posting>({ state: "loading" });
  const [text, setText] = useState("");
  const [fields, setFields] = useState(NO_FIELDS);
  const [resume, setResume] = useState<Resume>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // A result written from superseded text must not replace the current one.
  const latestJob = useRef<string>(undefined);

  useEffect(() => {
    let unmounted = false;

    request("/api/job").then(async (result) => {
      if (unmounted) return;
      if (!result.ok) return setPosting({ state: "failed", error: result.error });

      const job = await result.res.text();
      setPosting({ state: "loaded" });
      setText(job);
      setFields((f) => ({ ...f, link: f.link || linkOf(job) }));
      if (job.trim()) write(job);
    });

    return () => {
      unmounted = true;
    };
  }, []);

  async function write(job: string) {
    latestJob.current = job;
    setResume({ job, state: "writing" });
    const result = await sendJson("POST", "/api/generate", { job });
    if (latestJob.current !== job) return;
    if (!result.ok) return setResume({ job, state: "failed", error: result.error });

    const written: Draft = await result.res.json();
    if (latestJob.current !== job) return;
    setFields((f) => ({ ...f, company: f.company || written.company, position_title: f.position_title || written.role }));
    setResume({ job, state: "written", latex: written.latex });
  }

  const current = resume?.job === text ? resume : undefined;
  const pay = { pay_low: amountOf(fields.pay_low), pay_high: amountOf(fields.pay_high) };
  const payInvalid = Number.isNaN(pay.pay_low) || Number.isNaN(pay.pay_high);
  const canAdd = !saving && !payInvalid && text.trim() !== "";
  const progress = progressOf(posting, text, current);

  async function confirm(latex?: string) {
    setSaving(true);
    setError("");

    const result = await sendJson("POST", "/api/applications", { text, ...fields, ...pay });
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

  const textInput = (key: Exclude<keyof Fields, PayKey>, label: string, type = "text") => (
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
          {textInput("company", "Company")}
          {textInput("position_title", "Position title")}
          <div className="grid grid-cols-2 gap-3">
            {payInput("pay_low", "Pay low")}
            {payInput("pay_high", "Pay high")}
          </div>
          {textInput("location", "Location")}
          {textInput("deadline", "Deadline", "date")}
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

function progressOf(posting: Posting, text: string, resume: Resume | undefined) {
  if (posting.state === "loading") return { text: "Loading the posting…" };
  if (!text.trim() && posting.state === "failed") return { text: posting.error, error: true };
  if (!text.trim()) return { text: "No posting captured. Send one from the extension, or paste it here." };
  if (!resume) return { text: "Write the resume for this posting before confirming." };
  if (resume.state === "writing") return { text: "Writing the resume…" };
  if (resume.state === "failed") return { text: `Writing failed: ${resume.error}`, error: true };
  return { text: "Resume written. Confirm to open it." };
}

// The extension puts the page's URL on the posting's first line.
function linkOf(job: string) {
  const url = URL.parse(job.split("\n", 1)[0].trim());
  return url?.protocol === "http:" || url?.protocol === "https:" ? url.href : "";
}
