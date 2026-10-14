# TODO

Design lives in the Vault note `01 - Projects/GhostWriter.md`.

## Build

6. **Job intake API.** Accepts page `innerText` + link, derives `source`. Depends on 4.
7. **Bullet selection.** Jev (`typesafe/jev-1.13`, OpenRouter `POST /api/v1/systemone`) scores each bullet 0-3 against the posting; bullets are copied verbatim, never rewritten. Code then applies per-section min/max, at least 2 bullets per kept item, and skips bullets under 5 words. Duplicates: candidate pairs are bullets of a project and of the experience whose `company` equals the project's `associatedWith`; a Jev `noul` judges each pair once per resume sync (cached), and a pair at 0.7 or above can't both be selected. Probe on the 42 DS3 pairs: 5 duplicates scored 0.80-0.95, next highest 0.53. Checked against 10 postings with `scripts/score_postings.ts`. Depends on 5, 6.
8. **Extract application fields.** LLM fills company, title, pay, location, `req_id`, deadline, cover letter requirement. Depends on 6.
9. **Render and compile.** Template + Tectonic, writes `output/<company>-<role>-<id>/`, duplicate warning on `company` + `position_title`. Tectonic compile works on a stub document; the real template is untested. Fit loop: compile, read the page count from the `tectonic --keep-logs` log, drop the lowest-scored bullet that breaks no minimum, repeat until 1 page. Snapshot the final `.tex`, PDF and chosen bullet ids on the application. Depends on 7.
10. **Extension resume sync.** Scraper posts to the server. Depends on 5.
11. **Extension apply button.** Sends job tab text, opens the app. Depends on 6.
12. **Editor + PDF preview.** Split view, recompile 1 s after typing stops, paste fallback for job text. Depends on 9.
13. **Application tracker.** Table, status buttons, contacts and notes editing. Depends on 4, 8.
14. **Mark sent.** App and extension write the `sent` event. Depends on 13.

## Later

15. Cover letter from the same selection. Depends on 9.
16. Keyword coverage: JD terms hit vs missed. Depends on 7.
18. Model picker (free vs strong). Depends on 7.
19. Parse status emails into suggested events to confirm. Depends on 13.

## Done

1. **Take down Supabase matcher.** Project paused; CI deploy removed on `minimal`.
2. **PII in public repo.** Accepted as is: phone and email are already public on the personal website.
3. **Scaffold Bun + Vite app.** `bun dev` runs server and Vite; Vite proxies `/api`; Tailwind; `data/` and `output/` gitignored.
4. **SQLite schema.** `server/db.ts` creates `profile` (one JSON row), `applications` (enums enforced by `CHECK`), `status_events` (cascade on delete). Schema changes go in as append-only files in `server/migrations/`, tracked by `PRAGMA user_version`. Not yet wired into `server/server.ts`; #5 and #6 do that.
5. **Profile fields in the database.** Done: the navbar Profile button opens a form backed by `GET`/`PUT /api/profile`; `generate()` reads the `profile` row. No JSON file.
