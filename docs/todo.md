# TODO

Design lives in the Vault note `01 - Projects/GhostWriter.md`.

## Build

5. **Resume sync API.** Done in code, needs a live scrape: `PUT /api/resume` upserts `resume_items` by LinkedIn id. Remaining: move `data/profile.json` hand fields into the `profile` row.
6. **Job intake API.** Accepts page `innerText` + link, derives `source`. Depends on 4.
7. **LLM selection.** OpenRouter returns selection JSON (experiences, projects, skills). Depends on 5, 6.
8. **Extract application fields.** LLM fills company, title, pay, location, `req_id`, deadline, cover letter requirement. Depends on 6.
9. **Render and compile.** Template + Tectonic, writes `output/<company>-<role>-<id>/`, duplicate warning on `company` + `position_title`. Tectonic compile works on a stub document; the real template is untested. Depends on 7.
10. **Extension resume sync.** Scraper posts to the server. Depends on 5.
11. **Extension apply button.** Sends job tab text, opens the app. Depends on 6.
12. **Editor + PDF preview.** Split view, recompile 1 s after typing stops, paste fallback for job text. Depends on 9.
13. **Application tracker.** Table, status buttons, contacts and notes editing. Depends on 4, 8.
14. **Mark sent.** App and extension write the `sent` event. Depends on 13.

## Later

15. Cover letter from the same selection. Depends on 9.
16. Keyword coverage: JD terms hit vs missed. Depends on 7.
17. One-page check: warn when the PDF spills to page 2. Depends on 9.
18. Model picker (free vs strong). Depends on 7.
19. Parse status emails into suggested events to confirm. Depends on 13.

## Done

1. **Take down Supabase matcher.** Project paused; CI deploy removed on `minimal`.
2. **PII in public repo.** Accepted as is: phone and email are already public on the personal website.
3. **Scaffold Bun + Vite app.** `bun dev` runs server and Vite; Vite proxies `/api`; Tailwind; `data/` and `output/` gitignored.
4. **SQLite schema.** `server/db.ts` creates `profile` (one JSON row), `applications` (enums enforced by `CHECK`), `status_events` (cascade on delete). Schema changes go in as append-only files in `server/migrations/`, tracked by `PRAGMA user_version`. Not yet wired into `server/server.ts`; #5 and #6 do that.
