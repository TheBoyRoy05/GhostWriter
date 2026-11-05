import { expect, test, type Page } from "@playwright/test";
import { WRITTEN, addEvent, addStop, createApplication, dayOffset, openNew } from "./fixtures";

const SHOTS_DIR = "/tmp/gw-shots";

const VIEWPORTS = [
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

const RESUME_LATEX = String.raw`\documentclass{article}
\usepackage[margin=0.75in]{geometry}
\begin{document}
\section*{Ada Lovelace}
Test frameworks engineer. Built the regression harness for a game engine used by 40 teams.
\section*{Experience}
\textbf{Roblox} \hfill 2024--2026\\
Cut flaky test reruns from 12\% to 2\% by isolating shared fixtures.
\end{document}`;

const shoot = (page: Page, name: string) =>
  page.screenshot({ path: `${SHOTS_DIR}/${name}-${page.viewportSize()!.width}.png`, animations: "disabled" });

test("screenshots of every page at small and wide desktop width", async ({ page }) => {
  const talking = await createApplication(page.request, {
    company: "Roblox",
    position_title: "Test frameworks engineer",
    pay_low: 120000,
    pay_high: 150000,
    pay_unit: "year",
    deadline: dayOffset(17),
    location: "San Mateo, CA",
  });
  const rounds = [["sent", 21], ["interview_invite", 14], ["interview", 9], ["interview", 5], ["interview", 2]] as const;
  for (const [status, daysAgo] of rounds) await addEvent(page.request, talking, status, daysAgo);

  const offer = await createApplication(page.request, { company: "Whoop", position_title: "Frontend engineer, AI" });
  for (const [status, daysAgo] of [["sent", 30], ["interview_invite", 20], ["interview", 12], ["offer", 3]] as const) await addEvent(page.request, offer, status, daysAgo);

  const waiting = await createApplication(page.request, { company: "NVIDIA", position_title: "C++ infrastructure tools", deadline: dayOffset(27) });
  await addEvent(page.request, waiting, "sent", 6);

  const rejected = await createApplication(page.request, { company: "Palantir", position_title: "Forward deployed software engineer" });
  for (const [status, daysAgo] of [["sent", 21], ["rejected", 9]] as const) await addEvent(page.request, rejected, status, daysAgo);

  await createApplication(page.request, { company: "Figma", position_title: "Software engineer, editor" });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);

    await page.goto("/applications");
    await page.getByRole("link", { name: /Roblox/ }).waitFor();
    await shoot(page, "list");

    await page.goto(`/applications/${talking}`);
    await page.getByRole("heading", { name: "Roblox" }).waitFor();
    await shoot(page, "detail");

    await addStop(page, "Offer");
    await page.getByRole("menu").waitFor({ state: "detached" });
    await page.locator("[data-sonner-toast][data-mounted=true]").waitFor();
    await shoot(page, "toast");
    await page.getByRole("button", { name: "Undo Offer" }).click();
    await page.getByRole("button", { name: "Undo Interview" }).waitFor();

    await page.route("**/api/generate", (route) => route.fulfill({ json: WRITTEN }));
    await openNew(page, "https://jobs.example.com/roblox-test\n\nRoblox is hiring a test frameworks engineer to build the harness every engine team runs.");
    await expect(page.getByLabel("Position title")).toHaveValue(WRITTEN.role);
    await shoot(page, "new");

    await page.route("**/api/generate", (route) => route.fulfill({ status: 500, json: { error: "No resume in the database yet" } }));
    await page.reload();
    await page.getByRole("button", { name: "Confirm without resume" }).waitFor();
    await shoot(page, "new-failed");
    await page.unroute("**/api/generate");

    const draft = JSON.stringify({ ...WRITTEN, latex: RESUME_LATEX });
    await page.evaluate((value) => localStorage.setItem("ghostwriter.resumeDraft", value), draft);
    await page.goto("/");
    await page.locator("iframe[title='Resume page']").waitFor();
    await page.waitForTimeout(1000);
    await shoot(page, "resume");

    await page.evaluate(() => localStorage.removeItem("ghostwriter.resumeDraft"));
    await page.goto("/");
    await page.getByRole("heading", { name: "No resume yet" }).waitFor();
    await shoot(page, "resume-empty");

    await page.goto("/profile");
    await expect(page.getByRole("button", { name: "Save profile" })).toHaveCSS("opacity", "1");
    await shoot(page, "profile");
  }
});
