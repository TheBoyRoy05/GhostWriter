import { expect, test, type Page } from "@playwright/test";
import type { Application } from "../shared/applications";
import { WRITTEN, addStop, createApplication, dayOffset, openNew, uniqueLink } from "./fixtures";

const toast = (page: Page) => page.locator("[data-sonner-toast]");

test("a sent posting prefills its link, and the written resume fills only the fields left blank", async ({ page }) => {
  const link = uniqueLink();
  let finishWriting = () => {};
  const writingHeld = new Promise<void>((resolve) => (finishWriting = resolve));
  await page.route("**/api/generate", async (route) => {
    await writingHeld;
    await route.fulfill({ json: WRITTEN });
  });
  await openNew(page, `${link}\n\nBuild test frameworks for game engines.`);

  await expect(page.getByLabel("Link")).toHaveValue(link);
  await expect(page.getByRole("status")).toHaveText("Writing the resume…");
  await page.getByLabel("Company").fill("Typed Company");
  finishWriting();

  await expect(page.getByLabel("Position title")).toHaveValue(WRITTEN.role);
  await expect(page.getByLabel("Company")).toHaveValue("Typed Company");
});

test("Confirm waits for writing, then opens the resume and stores what was typed", async ({ page }) => {
  let finishWriting = () => {};
  const writingHeld = new Promise<void>((resolve) => (finishWriting = resolve));
  await page.route("**/api/generate", async (route) => {
    await writingHeld;
    await route.fulfill({ json: WRITTEN });
  });
  await openNew(page, "Build test frameworks for game engines.");
  const company = `Acme ${crypto.randomUUID()}`;
  const typed = { company, position_title: "Typed title", pay_low: 120000, pay_high: 150000, location: "Austin", deadline: dayOffset(30), link: uniqueLink() };
  await page.getByLabel("Company").fill(typed.company);
  await page.getByLabel("Position title").fill(typed.position_title);
  await page.getByLabel("Pay low").fill(String(typed.pay_low));
  await page.getByLabel("Pay high").fill(String(typed.pay_high));
  await page.getByLabel("Location").fill(typed.location);
  await page.getByLabel("Deadline").fill(typed.deadline);
  await page.getByLabel("Link").fill(typed.link);

  await expect(page.getByRole("button", { name: "Writing…" })).toBeDisabled();
  finishWriting();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("textbox", { name: "LaTeX source" })).toHaveValue(WRITTEN.latex);
  await expect(page.getByRole("status")).toHaveText(`Saved as ${company} ${typed.position_title}`);
  expect(await storedApplication(page, typed.link)).toMatchObject(typed);

  await page.goto("/applications");
  const notSent = page.getByRole("region", { name: /^Not sent/ });
  await expect(notSent.getByRole("link", { name: new RegExp(company) })).toBeVisible();
});

test("an edited posting needs Write resume before Confirm", async ({ page }) => {
  const jobs: string[] = [];
  await page.route("**/api/generate", (route) => {
    jobs.push(route.request().postDataJSON().job);
    return route.fulfill({ json: WRITTEN });
  });
  await openNew(page, "The posting as sent.");
  await expect(page.getByRole("status")).toHaveText("Resume written. Confirm to open it.");

  await page.getByLabel("Posting").fill("The posting as edited.");
  await expect(page.getByRole("button", { name: "Confirm", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Write resume" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();

  await expect(page).toHaveURL(/\/$/);
  expect(jobs).toEqual(["The posting as sent.", "The posting as edited."]);
});

test("a superseded write that finishes last does not replace the newer resume", async ({ page }) => {
  const newer = { ...WRITTEN, latex: `${WRITTEN.latex}\n% newer posting` };
  let finishFirst = () => {};
  const firstHeld = new Promise<void>((resolve) => (finishFirst = resolve));
  await page.route("**/api/generate", async (route) => {
    if (route.request().postDataJSON().job === "The posting as edited.") return route.fulfill({ json: newer });
    await firstHeld;
    await route.fulfill({ json: WRITTEN });
  });
  await openNew(page, "The posting as sent.");
  await expect(page.getByRole("status")).toHaveText("Writing the resume…");

  await page.getByLabel("Posting").fill("The posting as edited.");
  await page.getByRole("button", { name: "Write resume" }).click();
  await expect(page.getByRole("status")).toHaveText("Resume written. Confirm to open it.");
  const firstSettled = page.waitForResponse("**/api/generate");
  finishFirst();
  await (await firstSettled).finished();
  // The page parses the stale body after the response event; give it time to (wrongly) apply it.
  await page.waitForTimeout(200);

  await expect(page.getByRole("button", { name: "Confirm", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("textbox", { name: "LaTeX source" })).toHaveValue(newer.latex);
});

test("confirming a tracked link opens it with the Already tracked notice and saves nothing", async ({ page }) => {
  const link = uniqueLink();
  const tracked = { company: "Tracked Company", position_title: "Tracked title" };
  const id = await createApplication(page.request, tracked, link);
  const earlier = JSON.stringify({ ...WRITTEN, latex: `${WRITTEN.latex}\n% earlier draft` });
  await page.route("**/api/generate", (route) => route.fulfill({ json: WRITTEN }));
  await openNew(page, `${link}\n\nSame posting again.`);
  await page.evaluate((draft) => localStorage.setItem("ghostwriter.resumeDraft", draft), earlier);
  await page.getByLabel("Company").fill("Typed Company");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/applications/${id}$`));
  const notice = "Already tracked; what you entered and the new resume were not saved.";
  await expect(page.getByRole("status").filter({ hasText: notice })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("ghostwriter.resumeDraft"))).toBe(earlier);
  expect(await storedApplication(page, link)).toMatchObject({ id, ...tracked });
});

test("cancel creates nothing", async ({ page }) => {
  const countApplications = async () => ((await (await page.request.get("/api/applications")).json()) as unknown[]).length;
  const before = await countApplications();
  await page.route("**/api/generate", (route) => route.fulfill({ json: WRITTEN }));
  await openNew(page, "A posting to cancel.");
  await page.getByRole("link", { name: "Cancel" }).click();

  await expect(page).toHaveURL(/\/applications$/);
  expect(await countApplications()).toBe(before);
});

test("writing that fails can be retried", async ({ page }) => {
  let fail = true;
  await page.route("**/api/generate", (route) =>
    fail ? route.fulfill({ status: 500, json: { error: "No resume in the database yet" } }) : route.fulfill({ json: WRITTEN }),
  );
  await openNew(page, "A posting that fails to write once.");
  await expect(page.getByRole("status")).toHaveText("Writing failed: No resume in the database yet");
  await expect(page.getByRole("button", { name: "Confirm", exact: true })).toBeDisabled();

  fail = false;
  await page.getByRole("button", { name: "Write resume" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("textbox", { name: "LaTeX source" })).toHaveValue(WRITTEN.latex);
});

test("Confirm without resume creates the application and keeps the earlier draft", async ({ page }) => {
  const earlier = { ...WRITTEN, latex: `${WRITTEN.latex}\n% earlier draft` };
  await page.route("**/api/generate", (route) => route.fulfill({ status: 500, json: { error: "No resume in the database yet" } }));
  const link = uniqueLink();
  await openNew(page, `${link}\n\nA posting that fails to write.`);
  await page.evaluate((draft) => localStorage.setItem("ghostwriter.resumeDraft", draft), JSON.stringify(earlier));
  await page.getByRole("button", { name: "Confirm without resume" }).click();

  await expect(page).toHaveURL(/\/applications\/\d+$/);
  expect(await storedApplication(page, link)).toMatchObject({ link });
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "LaTeX source" })).toHaveValue(earlier.latex);
});

test("edited company and pay persist after a reload", async ({ page }) => {
  const id = await createApplication(page.request);
  await page.goto(`/applications/${id}`);

  await page.getByLabel("Company").fill("Acme Robotics");
  await page.getByLabel("Low").fill("120000");
  await page.getByLabel("High").fill("150000");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(toast(page).filter({ hasText: "Saved" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Acme Robotics" })).toBeVisible();
  await expect(page.getByLabel("Company")).toHaveValue("Acme Robotics");
  await expect(page.getByLabel("Low")).toHaveValue("120000");
  await expect(page.getByLabel("High")).toHaveValue("150000");
});

test("pay that is not a number blocks Save", async ({ page }) => {
  const id = await createApplication(page.request);
  await page.goto(`/applications/${id}`);

  await page.getByLabel("Low").fill("120k");

  await expect(page.getByText("Must be a number")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
});

test("the toast Undo removes the stop just added", async ({ page }) => {
  const id = await createApplication(page.request);
  await page.goto(`/applications/${id}`);

  await addStop(page, "Sent");
  await expect(toast(page).filter({ hasText: "Marked Sent" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo Sent" })).toBeVisible();

  await toast(page).getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("Not sent yet.")).toBeVisible();
});

test("the persistent Undo removes the latest stop and dismisses its toast", async ({ page }) => {
  const id = await createApplication(page.request);
  await page.goto(`/applications/${id}`);

  await addStop(page, "Interview");
  await expect(toast(page).filter({ hasText: "Marked Interview" })).toBeVisible();
  await page.getByRole("button", { name: "Undo Interview" }).click();

  await expect(page.getByText("Not sent yet.")).toBeVisible();
  await expect(toast(page)).toHaveCount(0);
});

test("a second stop replaces the first toast, whose Undo removes only the second", async ({ page }) => {
  const id = await createApplication(page.request);
  await page.goto(`/applications/${id}`);

  await addStop(page, "Sent");
  await expect(toast(page).filter({ hasText: "Marked Sent" })).toBeVisible();
  await addStop(page, "Interview");
  await expect(toast(page).filter({ hasText: "Marked Interview" })).toBeVisible();
  await expect(toast(page)).toHaveCount(1);

  await toast(page).getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Undo Sent" })).toBeVisible();
  await expect(toast(page)).toHaveCount(0);
});

test("a backdated stop shows its own date", async ({ page }) => {
  const id = await createApplication(page.request);
  await page.goto(`/applications/${id}`);

  const isoDay = dayOffset(-10);
  await page.getByLabel("Date", { exact: true }).fill(isoDay);
  await addStop(page, "Sent");

  const shown = new Date(`${isoDay}T00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  await expect(page.getByRole("region", { name: "Status" }).getByRole("listitem").locator("time")).toHaveText(shown);
});

test("a saved profile persists after a reload", async ({ page }, testInfo) => {
  const name = `Test User ${testInfo.project.name}`;
  await page.goto("/profile");

  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(toast(page).filter({ hasText: "Profile saved" })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(name);
});

test("an edited resume survives a reload and is recompiled", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((draft) => localStorage.setItem("ghostwriter.resumeDraft", JSON.stringify(draft)), WRITTEN);
  const compile = page.waitForRequest((request) => request.url().endsWith("/api/compile"));
  await page.reload();
  expect((await compile).postDataJSON()).toEqual(WRITTEN);

  const edited = `${WRITTEN.latex}\n% edited by hand`;
  await page.getByRole("textbox", { name: "LaTeX source" }).fill(edited);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "LaTeX source" })).toHaveValue(edited);
});

test("a corrupt draft is ignored", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ghostwriter.resumeDraft", "{"));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "No resume yet" })).toBeVisible();
});

async function storedApplication(page: Page, link: string) {
  const applications = (await (await page.request.get("/api/applications")).json()) as Application[];
  return applications.find((application) => application.link === link);
}
