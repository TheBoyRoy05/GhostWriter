import { useEffect, useRef, useState } from "react";
import ProfileDialog from "./ProfileDialog";

type Status = { text: string; error?: boolean };

const RECOMPILE_DELAY_MS = 1000;

const postJson = (path: string, body: unknown) =>
  fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const field =
  "w-full resize-none rounded border border-edge bg-panel p-3 text-sm outline-none focus:border-neon";

export default function App() {
  const [job, setJob] = useState("");
  const [latex, setLatex] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [status, setStatus] = useState<Status>({ text: "" });
  const [generating, setGenerating] = useState(false);
  const meta = useRef({ company: "", role: "" });
  const recompileTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    fetch("/api/job").then((res) => res.text()).then(setJob);
  }, []);

  useEffect(() => () => URL.revokeObjectURL(pdfUrl), [pdfUrl]);

  async function compile(source: string) {
    setStatus({ text: "Compiling…" });
    const res = await postJson("/api/compile", { latex: source, ...meta.current });
    if (!res.ok) return setStatus({ text: (await res.json()).error, error: true });
    setPdfUrl(URL.createObjectURL(await res.blob()));
    setStatus({ text: `Saved to output/ (${meta.current.company || "untitled"})` });
  }

  async function generate() {
    setGenerating(true);
    setStatus({ text: "Generating…" });
    try {
      const res = await postJson("/api/generate", { job });
      const body = await res.json();
      if (!res.ok) return setStatus({ text: body.error, error: true });
      meta.current = { company: body.company, role: body.role };
      setLatex(body.latex);
      await compile(body.latex);
    } finally {
      setGenerating(false);
    }
  }

  function editLatex(source: string) {
    setLatex(source);
    clearTimeout(recompileTimer.current);
    recompileTimer.current = setTimeout(() => compile(source), RECOMPILE_DELAY_MS);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-edge px-4 py-2">
        <h1 className="font-semibold text-neon">GhostWriter</h1>
        <ProfileDialog />
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-2">
        <section className="grid min-h-0 grid-rows-[30%_auto_1fr_auto] gap-3 p-4">
          <textarea
            className={field}
            aria-label="Job description"
            placeholder="Paste the job description, or send it from the extension"
            value={job}
            onChange={(e) => setJob(e.target.value)}
          />
          <button
            className="rounded border border-neon px-4 py-2 font-semibold text-neon transition hover:bg-neon hover:text-black disabled:opacity-40"
            disabled={generating || !job.trim()}
            onClick={generate}
          >
            Generate
          </button>
          <textarea
            className={field}
            aria-label="LaTeX source"
            placeholder="LaTeX appears here. Edits recompile after 1 s."
            value={latex}
            onChange={(e) => editLatex(e.target.value)}
          />
          <p role="status" className={`max-h-32 overflow-auto whitespace-pre-wrap text-sm ${status.error ? "text-danger" : "text-ink"}`}>
            {status.text}
          </p>
        </section>
        <iframe className="h-full w-full border-l border-edge bg-panel" title="Resume PDF preview" src={pdfUrl || undefined} />
      </main>
    </div>
  );
}
