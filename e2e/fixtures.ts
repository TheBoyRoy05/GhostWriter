import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { localDay } from "../web/src/lib/format";

export const WRITTEN = {
  latex: "\\documentclass{article}\\begin{document}Test engineer resume.\\end{document}",
  company: "Acme Robotics",
  role: "Test engineer",
};

export const uniqueLink = () => `https://jobs.example.com/${crypto.randomUUID()}`;

export function dayOffset(days: number) {
  const day = new Date();
  day.setDate(day.getDate() + days);
  return localDay(day);
}

export async function createApplication(request: APIRequestContext, fields: Record<string, unknown> = {}, link = uniqueLink()) {
  const created = await request.post("/api/applications", { data: { text: "Software engineer posting", link } });
  expect(created.ok()).toBe(true);
  const { id } = (await created.json()) as { id: number };

  if (Object.keys(fields).length > 0) {
    const patched = await request.patch(`/api/applications/${id}`, { data: fields });
    expect(patched.ok()).toBe(true);
  }
  return id;
}

export async function addEvent(request: APIRequestContext, applicationId: number, status: string, daysAgo: number) {
  const at = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const added = await request.post(`/api/applications/${applicationId}/events`, { data: { status, at } });
  expect(added.ok()).toBe(true);
}

export async function addStop(page: Page, status: string) {
  await page.getByRole("button", { name: "Add stop" }).click();
  await page.getByRole("menuitem", { name: status, exact: true }).click();
}

// Callers stub /api/generate first, since the real one calls OpenRouter.
export async function openNew(page: Page, posting: string) {
  await page.request.post("/api/job", { data: { text: posting } });
  await page.goto("/new");
}
