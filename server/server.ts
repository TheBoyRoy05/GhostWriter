import { rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import buildPrompt from "./prompt";
import { buildLatexFromMatcherResult, type MatcherJsonResult } from "./latex";
import { openDatabase } from "./db";
import { readResume, syncResume } from "./resume";
import { readProfile, writeProfile } from "./profile";
import { addApplication } from "./applications";

const ROOT = join(import.meta.dir, "..");
const JOB = join(ROOT, "data/job.txt");
const OUTPUT = join(ROOT, "output");
const PORT = Number(process.env.PORT ?? 3000);
const db = openDatabase(join(ROOT, "data/ghostwriter.db"));
const MODEL = process.env.OPENROUTER_MODEL ?? "arcee-ai/trinity-large-preview:free";

async function writeAtomic(path: string, data: string) {
  await Bun.write(`${path}.tmp`, data);
  await rename(`${path}.tmp`, path);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";

function stripCodeFence(text: string) {
  return text.replace(/^\s*```(?:json)?\s*/, "").replace(/\s*```\s*$/, "").trim();
}

async function generate(job: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set in .env");
  const resume = readResume(db);
  if (resume.experiences.length === 0) throw new Error("No resume in the database yet; run the LinkedIn scrape first");
  const profile = readProfile(db);
  if (!profile?.name) throw new Error("Fill in your profile first (Profile button, top right)");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: buildPrompt(job, resume) }],
      max_tokens: 8192,
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const content = (await res.json())?.choices?.[0]?.message?.content ?? "";
  const result: MatcherJsonResult & { company?: string; role?: string } = JSON.parse(stripCodeFence(content));

  return {
    company: result.company ?? "",
    role: result.role ?? "",
    latex: buildLatexFromMatcherResult(result, profile, resume, result.role),
  };
}

async function compile(latex: string, company: string, role: string) {
  const dir = join(OUTPUT, slug(`${company}-${role}`));
  await mkdir(dir, { recursive: true });
  await Bun.write(join(dir, "resume.tex"), latex);
  const proc = Bun.spawn(["tectonic", "--chatter", "minimal", "resume.tex"], { cwd: dir, stderr: "pipe" });
  const stderr = await new Response(proc.stderr).text();
  if ((await proc.exited) !== 0) throw new Error(stderr);
  return Bun.file(join(dir, "resume.pdf"));
}

// Any web page can send requests to localhost. Requiring a JSON content type
// forces a CORS preflight, which fails because we never send CORS headers.
async function jsonBody(req: Request) {
  if (!req.headers.get("content-type")?.startsWith("application/json")) {
    throw new Error("Content-Type must be application/json");
  }
  return req.json();
}

const fail = (err: unknown, status = 500) =>
  Response.json({ error: err instanceof Error ? err.message : String(err) }, { status });

Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  routes: {
    "/api/resume": {
      PUT: async (req) => {
        try {
          const resume = await jsonBody(req);
          const counts = Object.entries(resume).map(([key, value]) => `${key}=${Array.isArray(value) ? value.length : "?"}`);
          console.log(`PUT /api/resume ${counts.join(" ")}`);
          const { kept } = syncResume(db, resume);
          if (kept.length) console.warn(`PUT /api/resume scraped no ${kept.join(", ")}; kept stored rows`);
          return Response.json({ ok: true, kept });
        } catch (e) {
          return fail(e, 400);
        }
      },
    },
    "/api/profile": {
      GET: () => Response.json(readProfile(db) ?? {}),
      PUT: async (req) => {
        try {
          return Response.json(writeProfile(db, await jsonBody(req)));
        } catch (e) {
          return fail(e, 400);
        }
      },
    },
    "/api/applications": {
      POST: async (req) => {
        try {
          const result = addApplication(db, await jsonBody(req));
          console.log(`POST /api/applications id=${result.id} ${result.created ? "created" : "existing link"}`);
          return Response.json(result, { status: result.created ? 201 : 200 });
        } catch (e) {
          return fail(e, 400);
        }
      },
    },
    "/api/job": {
      GET: async () => {
        const file = Bun.file(JOB);
        return new Response((await file.exists()) ? file : "");
      },
      POST: async (req) => {
        try {
          const { text } = await jsonBody(req);
          await writeAtomic(JOB, String(text ?? ""));
          return Response.json({ ok: true });
        } catch (e) {
          return fail(e, 400);
        }
      },
    },
    "/api/generate": {
      POST: async (req) => {
        try {
          const { job } = await jsonBody(req);
          await writeAtomic(JOB, job);
          return Response.json(await generate(job));
        } catch (e) {
          return fail(e);
        }
      },
    },
    "/api/compile": {
      POST: async (req) => {
        try {
          const { latex, company, role } = await jsonBody(req);
          return new Response(await compile(latex, company ?? "", role ?? ""), {
            headers: { "Content-Type": "application/pdf" },
          });
        } catch (e) {
          return fail(e, 422);
        }
      },
    },
  },
});

console.log(`GhostWriter on http://127.0.0.1:${PORT}`);
