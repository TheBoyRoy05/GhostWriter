# GhostWriter

Generates a tailored one-page resume from your LinkedIn data and a job description. Runs locally for a single user.

## Setup

1. Install [Bun](https://bun.sh) and [Tectonic](https://tectonic-typesetting.github.io): `brew install oven-sh/bun/bun tectonic`
2. Create `.env` with `OPENROUTER_API_KEY=...` (optionally `OPENROUTER_MODEL=...`).
3. Copy `data/profile.example.json` to `data/profile.json` and fill it in. This holds the contact details LinkedIn scraping does not capture.
4. Run `bun run build:extension`, then load `extension/` as an unpacked extension at `chrome://extensions` (Developer mode).
5. Run `bun dev` and open http://127.0.0.1:5173.

## Use

- Profile: open the extension, enter your LinkedIn profile URL, click Scrape LinkedIn Profile. The scraper walks your detail pages and saves them to the `resume_items` table in `data/ghostwriter.db`.
- Job: on a job posting, click Send This Job Page, or paste the description into the app.
- Click Generate. The model picks the most relevant experiences, projects and skills; the server renders them into LaTeX and compiles a PDF. Edit the LaTeX and the preview recompiles.

Everything under `data/` except the example, and everything under `output/`, is gitignored because it contains personal information.
