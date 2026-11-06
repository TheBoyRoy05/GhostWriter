import { expect, test } from "@playwright/test";

test("a sent posting stores its JSON-LD, and a later send without one stores null", async ({ request }) => {
  const jobPosting = { "@type": "JobPosting", title: "Test engineer" };

  expect((await request.post("/api/job", { data: { text: "With JSON-LD", jobPosting } })).ok()).toBe(true);
  expect(await (await request.get("/api/job-posting")).json()).toEqual(jobPosting);

  expect((await request.post("/api/job", { data: { text: "Without JSON-LD" } })).ok()).toBe(true);
  expect(await (await request.get("/api/job-posting")).json()).toBeNull();
  expect(await (await request.get("/api/job")).text()).toBe("Without JSON-LD");
});

test("a send whose JSON-LD is not an object is refused and stores nothing", async ({ request }) => {
  await request.post("/api/job", { data: { text: "Kept posting", jobPosting: { title: "Kept" } } });

  const refused = await request.post("/api/job", { data: { text: "Refused posting", jobPosting: ["not", "an", "object"] } });

  expect(refused.status()).toBe(400);
  expect(await refused.json()).toEqual({ error: "jobPosting must be an object or null" });
  expect(await (await request.get("/api/job")).text()).toBe("Kept posting");
  expect(await (await request.get("/api/job-posting")).json()).toEqual({ title: "Kept" });
});

test("extract refuses a body without text or with a non-object JSON-LD", async ({ request }) => {
  const noText = await request.post("/api/extract", { data: { jobPosting: null } });
  expect(noText.status()).toBe(400);
  expect(await noText.json()).toEqual({ error: "text must be a string" });

  const badPosting = await request.post("/api/extract", { data: { text: "Posting", jobPosting: "JobPosting" } });
  expect(badPosting.status()).toBe(400);
  expect(await badPosting.json()).toEqual({ error: "jobPosting must be an object or null" });

  const notJson = await request.post("/api/extract", { headers: { "Content-Type": "text/plain" }, data: "Posting" });
  expect(notJson.status()).toBe(400);
});
