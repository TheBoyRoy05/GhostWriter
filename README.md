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
