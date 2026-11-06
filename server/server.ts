import { rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import buildPrompt from "./prompt";
import { buildLatexFromMatcherResult, type MatcherJsonResult } from "./latex";
import { openDatabase } from "./db";
import { readResume, syncResume } from "./resume";
import { readProfile, writeProfile } from "./profile";
import { extractFields } from "./extract";
import { askOpenRouter } from "./openrouter";
import { addApplication, addStatusEvent, deleteStatusEvent, listApplications, updateApplication } from "./applications";

const ROOT = join(import.meta.dir, "..");
const JOB = join(ROOT, "data/job.txt");
const JOB_POSTING = join(ROOT, "data/job-posting.json");
const OUTPUT = join(ROOT, "output");
const PORT = Number(process.env.PORT ?? 3000);
await mkdir(join(ROOT, "data"), { recursive: true });
const db = openDatabase(join(ROOT, "data/ghostwriter.db"));

async function writeAtomic(path: string, data: string) {
  await Bun.write(`${path}.tmp`, data);
  await rename(`${path}.tmp`, path);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";

async function generate(job: string) {
  const resume = readResume(db);
  if (resume.experiences.length === 0) throw new Error("No resume in the database yet; run the LinkedIn scrape first");
  const profile = readProfile(db);
  if (!profile?.name) throw new Error("Fill in your profile first (Profile button, top right)");

  const options = { maxTokens: 8192, temperature: 0.7 };
  const result = (await askOpenRouter(buildPrompt(job, resume), options)) as MatcherJsonResult & { company?: string; role?: string };

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

function fail(req: Request, err: unknown, status = 500) {
  const error = err instanceof Error ? err.message : String(err);
  console.warn(`${req.method} ${new URL(req.url).pathname} ${status}: ${error}`);
  return Response.json({ error }, { status });
}

function jobPostingOf(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("jobPosting must be an object or null");
  return value as Record<string, unknown>;
}

// Number() would also accept "0x1", "1e0" and " 1", so one row would answer to several URLs.
const idOf = (text: string) => (/^\d+$/.test(text) ? Number(text) : null);

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
          return fail(req, e, 400);
        }
      },
    },
    "/api/profile": {
      GET: () => Response.json(readProfile(db) ?? {}),
      PUT: async (req) => {
        try {
          return Response.json(writeProfile(db, await jsonBody(req)));
        } catch (e) {
          return fail(req, e, 400);
        }
      },
    },
    "/api/applications": {
      GET: () => {
        const applications = listApplications(db);
        console.log(`GET /api/applications count=${applications.length}`);
        return Response.json(applications);
      },
      POST: async (req) => {
        try {
          const result = addApplication(db, await jsonBody(req));
          console.log(`POST /api/applications id=${result.id} ${result.created ? "created" : "existing link"}`);
          return Response.json(result, { status: result.created ? 201 : 200 });
        } catch (e) {
          return fail(req, e, 400);
        }
      },
    },
    "/api/applications/:id": {
      PATCH: async (req) => {
        const id = idOf(req.params.id);
        if (id === null) return fail(req, "Application not found", 404);
        try {
          const updated = updateApplication(db, id, await jsonBody(req));
          if (!updated) return fail(req, "Application not found", 404);
          console.log(`PATCH /api/applications/${id} fields=${updated.fields.join(",") || "none"}`);
          return Response.json(updated.application);
        } catch (e) {
          return fail(req, e, 400);
        }
      },
    },
    "/api/applications/:id/events": {
      POST: async (req) => {
        const id = idOf(req.params.id);
        if (id === null) return fail(req, "Application not found", 404);
        try {
          const event = addStatusEvent(db, id, await jsonBody(req));
          if (!event) return fail(req, "Application not found", 404);
          console.log(`POST /api/applications/${id}/events id=${event.id} status=${event.status} at=${event.at}`);
          return Response.json(event, { status: 201 });
        } catch (e) {
          return fail(req, e, 400);
        }
      },
    },
    "/api/applications/:id/events/:eventId": {
      DELETE: (req) => {
        const applicationId = idOf(req.params.id);
        const eventId = idOf(req.params.eventId);
        if (applicationId === null || eventId === null) return fail(req, "Status event not found", 404);

        const removed = deleteStatusEvent(db, applicationId, eventId);
        if (removed === "missing") return fail(req, "Status event not found", 404);
        if (removed === "not_last_recorded") return fail(req, "Only the last recorded status event can be undone", 409);

        console.log(`DELETE /api/applications/${applicationId}/events/${removed.id} status=${removed.status} at=${removed.at}`);
        return new Response(null, { status: 204 });
      },
    },
    "/api/job": {
      GET: async () => {
        const file = Bun.file(JOB);
        return new Response((await file.exists()) ? file : "");
      },
      POST: async (req) => {
        try {
          const { text, jobPosting } = await jsonBody(req);
          const posting = jobPostingOf(jobPosting);
          // Written even when null, so a posting captured earlier never pairs with this text.
          await writeAtomic(JOB_POSTING, JSON.stringify(posting));
          await writeAtomic(JOB, String(text ?? ""));
          console.log(`POST /api/job json-ld=${posting ? "yes" : "no"}`);
          return Response.json({ ok: true });
        } catch (e) {
          return fail(req, e, 400);
        }
      },
    },
    "/api/job-posting": {
      GET: async () => {
        const file = Bun.file(JOB_POSTING);
        return (await file.exists()) ? new Response(file, { headers: { "Content-Type": "application/json" } }) : Response.json(null);
      },
    },
    "/api/extract": {
      POST: async (req) => {
        try {
          const { text, jobPosting } = await jsonBody(req);
          if (typeof text !== "string") throw new Error("text must be a string");
          return Response.json(await extractFields(text, jobPostingOf(jobPosting)));
        } catch (e) {
          return fail(req, e, 400);
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
          return fail(req, e);
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
          return fail(req, e, 422);
        }
      },
    },
  },
});

console.log(`GhostWriter on http://127.0.0.1:${PORT}`);
