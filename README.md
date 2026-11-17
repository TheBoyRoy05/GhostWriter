# GhostWriter

Generates a tailored one-page resume from your LinkedIn data and a job description. Runs locally for a single user.

## Setup

1. Install [Bun](https://bun.sh) and [Tectonic](https://tectonic-typesetting.github.io): `brew install oven-sh/bun/bun tectonic`
2. Create `.env` with `OPENROUTER_API_KEY=...`.
3. Run `bun run build:extension`, then load `extension/` as an unpacked extension at `chrome://extensions` (Developer mode).
4. Run `bun dev` and open http://127.0.0.1:5173. Click Profile and fill in the contact details LinkedIn scraping does not capture.

## Use

- Profile: open the extension, enter your LinkedIn profile URL, click Scrape LinkedIn Profile. The scraper walks your detail pages and saves them to the `resume_items` table in `data/ghostwriter.db`.
- Job: on a job posting, click Apply to This Job Page, or paste the description (and optional link) into the popup and click Apply to Pasted Job.
- Click Generate. Jev scores each bullet and skill against the posting, and the server keeps the best-scoring experiences, projects and skills, trims bullets to one page, renders them into LaTeX and compiles a PDF. Each skill's row (Languages, Tools or Domain) is classified once and stored in its `resume_items` row as `skill_row`. Edit the LaTeX and the preview recompiles.

Everything under `data/` and `output/` is gitignored because it contains personal information.

## Evals

Public postings live in `fixtures/postings/` (tracked); your resume stays in `data/`. Run both evals with the key in `.env`; the model is `OPENROUTER_MODEL`, default `nvidia/nemotron-3.5-lightning:free`.

- Extraction: `bun --env-file=.env scripts/eval_extract.ts [repeats=3]` runs `extractFields` over `fixtures/postings/extract/<slug>/` (`text.txt` (line 1 is the URL), `job-posting.json`, `expected.json`) and prints `correct/runs` per field. Runs that hit a network, 429 or bad-JSON error count in the `errors` column, not as wrong. `bun test` checks the JSON-LD path on the same fixtures with no network.
- The default model needs reasoning disabled (sent as `reasoning: { enabled: false }`); a model that makes reasoning mandatory rejects the request.
- Resume: `bun --env-file=.env scripts/eval_resume.ts` runs `tailorResume` on each `fixtures/postings/jev/*.txt` against a temp copy of `data/ghostwriter.db`, writes `output/eval/<slug>/resume.{tex,pdf}`, and checks one page and no near-duplicate bullets per posting, plus one up-front check that the profile has hobbies. Set `GHOSTWRITER_DB` to use a database elsewhere.
- Jev ranking: `bun --env-file=.env scripts/score_postings.ts` scores every resume bullet against the same Jev postings.
