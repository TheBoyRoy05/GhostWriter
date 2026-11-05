import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendJson } from "@/lib/api";
import { cn } from "@/lib/utils";

export type Draft = { latex: string; company: string; role: string };
type Progress = { text: string; log?: string; error?: boolean };

const RECOMPILE_DELAY_MS = 1000;
const DRAFT_KEY = "ghostwriter.resumeDraft";

export default function ResumeView() {
  const [draft] = useState(readDraft);
  const [latex, setLatex] = useState(draft?.latex ?? "");
  const [pdfUrl, setPdfUrl] = useState("");
  const [progress, setProgress] = useState<Progress>({ text: "" });
  const recompileTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latestCompile = useRef(0);

  useEffect(() => {
    if (draft?.latex) compile(draft.latex);
  }, []);

  useEffect(() => {
    if (draft?.latex) saveDraft({ ...draft, latex });
  }, [latex]);

  useEffect(() => () => URL.revokeObjectURL(pdfUrl), [pdfUrl]);

  useEffect(
    () => () => {
      // Superseding in-flight compiles stops them creating a blob URL the revoke above already missed.
      latestCompile.current++;
      clearTimeout(recompileTimer.current);
    },
    [],
  );

  async function compile(source: string) {
    const compileNumber = ++latestCompile.current;
    // A slower earlier compile must not replace a newer page.
    const isLatest = () => compileNumber === latestCompile.current;

    setProgress({ text: "Compiling…" });
    const result = await sendJson("POST", "/api/compile", { latex: source, company: draft?.company, role: draft?.role });
    if (!result.ok) {
      if (isLatest()) setProgress({ text: "The LaTeX did not compile. Fix it and the page recompiles.", log: result.error, error: true });
      return;
    }

    const pdf = await result.res.blob();
    if (!isLatest()) return;
    setPdfUrl(URL.createObjectURL(pdf));
    setProgress({ text: `Saved as ${[draft?.company, draft?.role].filter(Boolean).join(" ") || "untitled"}` });
  }

  function editLatex(source: string) {
    setLatex(source);
    clearTimeout(recompileTimer.current);
    recompileTimer.current = setTimeout(() => compile(source), RECOMPILE_DELAY_MS);
  }

  if (!draft?.latex) {
    return (
      <div className="mx-auto my-6 grid max-w-5xl gap-2 rounded-md border bg-panel p-6">
        <h1 className="text-2xl font-semibold">No resume yet</h1>
        <p className="text-dim">
          Send a posting from the extension, or start a{" "}
          <Link href="/new" className="text-signal underline underline-offset-4">
            new application
          </Link>
          . The resume is written while you confirm the application.
        </p>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-2">
      <section aria-label="LaTeX" className="flex min-h-0 flex-col gap-3 border-r bg-panel p-6">
        <Textarea
          aria-label="LaTeX source"
          className="min-h-0 flex-1 resize-none font-mono text-sm [field-sizing:fixed]"
          spellCheck={false}
          value={latex}
          onChange={(e) => editLatex(e.target.value)}
        />
        <ProgressLine progress={progress} />
      </section>

      <section aria-label="Resume page" className="flex min-h-0 flex-col gap-4 p-6">
        <div className="flex h-8 gap-2">
          {pdfUrl && (
            <>
              <Button variant="outline" asChild>
                <a href={pdfUrl} download="resume.pdf">
                  <Download aria-hidden />
                  Download
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={pdfUrl} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden />
                  Open PDF
                </a>
              </Button>
            </>
          )}
        </div>
        <div className="min-h-0 flex-1 bg-paper">{pdfUrl && <iframe className="h-full w-full" title="Resume page" src={pdfUrl} />}</div>
      </section>
    </div>
  );
}

function ProgressLine({ progress }: { progress: Progress }) {
  return (
    <div role="status" className={cn("text-sm", progress.error ? "text-fault" : "text-ink")}>
      <p>{progress.text}</p>
      {progress.log && (
        <details className="mt-1">
          <summary className="cursor-pointer">Compiler log</summary>
          <pre className="mt-1 max-h-48 overflow-auto font-mono whitespace-pre-wrap text-ink">{progress.log}</pre>
        </details>
      )}
    </div>
  );
}

function readDraft(): Draft | null {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    const fields = ["latex", "company", "role"] as const;
    return fields.every((field) => typeof draft?.[field] === "string") ? draft : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Blocked or full storage only costs reload survival.
  }
}
