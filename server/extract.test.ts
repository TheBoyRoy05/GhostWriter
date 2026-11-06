import { afterEach, describe, expect, mock, test } from "bun:test";
import { extractFields, fieldsFromJobPosting } from "./extract";

const LINK = "https://jobs.ashbyhq.com/acme/8fb1615c-34bf-47c4-a1d1-b7b2f836bbd3";

const ASHBY_POSTING = {
  "@type": "JobPosting",
  title: "Technical Program Manager",
  identifier: { "@type": "PropertyValue", name: "Acme", value: "8fb1615c-34bf-47c4-a1d1-b7b2f836bbd3" },
  hiringOrganization: { "@type": "Organization", name: "Acme" },
  jobLocation: { "@type": "Place", address: { addressLocality: "San Francisco", addressRegion: "California", addressCountry: "United States" } },
  baseSalary: { "@type": "MonetaryAmount", currency: "USD", value: { minValue: 207000, maxValue: 285000, unitText: "YEAR" } },
  validThrough: "2026-12-01T23:59:00-08:00",
};

const salaryOf = (baseSalary: unknown) => fieldsFromJobPosting({ baseSalary });

describe("fieldsFromJobPosting", () => {
  test("maps a full posting and leaves the deadline to the text, since validThrough is the listing's expiry", () => {
    expect(fieldsFromJobPosting(ASHBY_POSTING)).toEqual({
      company: "Acme",
      position_title: "Technical Program Manager",
      pay_low: 207000,
      pay_high: 285000,
      pay_unit: "year",
      location: "San Francisco, California, United States",
      req_id: "8fb1615c-34bf-47c4-a1d1-b7b2f836bbd3",
    });
  });

  test("a text field is capped at 300 characters", () => {
    expect(fieldsFromJobPosting({ title: "x".repeat(5000) }).position_title).toHaveLength(300);
  });

  test("a single salary value fills both ends of the range", () => {
    expect(salaryOf({ value: { value: "42.5", unitText: "HOUR" } })).toEqual({ pay_low: 42.5, pay_high: 42.5, pay_unit: "hour" });
    expect(salaryOf({ value: 5000, unitText: "MONTH" })).toEqual({ pay_low: 5000, pay_high: 5000, pay_unit: "month" });
  });

  test("a range with one end settles the other as empty", () => {
    expect(salaryOf({ value: { minValue: 90000, unitText: "YEAR" } })).toEqual({ pay_low: 90000, pay_high: null, pay_unit: "year" });
  });

  test("a salary per week or day is dropped rather than mislabelled", () => {
    expect(salaryOf({ value: { minValue: 2000, maxValue: 2500, unitText: "WEEK" } })).toEqual({ pay_low: null, pay_high: null, pay_unit: null });
  });

  test("a salary with no unit leaves the unit unsettled", () => {
    expect(salaryOf({ value: { minValue: 1, maxValue: 2 } })).toEqual({ pay_low: 1, pay_high: 2 });
  });

  test("fields the posting lacks are left out, not guessed", () => {
    expect(fieldsFromJobPosting({ "@type": "JobPosting", title: "  ", baseSalary: { currency: "USD" }, validThrough: "soon" })).toEqual({});
  });

  test("an employer req ID is kept, and several places join into one location", () => {
    const posting = {
      identifier: { value: "R-1234" },
      hiringOrganization: "Acme",
      jobLocation: [{ address: { addressLocality: "Singapore, Singapore", addressRegion: null } }, { address: "Austin, TX" }],
    };
    expect(fieldsFromJobPosting(posting)).toEqual({ company: "Acme", req_id: "R-1234", location: "Singapore, Singapore; Austin, TX" });
  });
});

describe("extractFields", () => {
  const realFetch = globalThis.fetch;
  const realKey = process.env.OPENROUTER_API_KEY;

  afterEach(() => {
    globalThis.fetch = realFetch;
    // Assigning undefined would store the string "undefined".
    if (realKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = realKey;
  });

  function stubModel(answer: unknown) {
    const content = `\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``;
    const fetchMock = mock(async (_url: string | URL | Request, _init?: RequestInit) => Response.json({ choices: [{ message: { content } }] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    process.env.OPENROUTER_API_KEY = "test-key";
    return fetchMock;
  }

  const askedFields = (fetchMock: ReturnType<typeof stubModel>) => {
    const { messages } = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    return [...messages[0].content.matchAll(/^- (\w+):/gm)].map((match) => match[1]);
  };

  test("asks the model only for what JSON-LD lacks, and keeps JSON-LD where both answer", async () => {
    const fetchMock = stubModel({ company: "Wrong Co", req_id: "R-77", cover_letter: "required", deadline: null, pay_unit: "year" });

    const { fields, error } = await extractFields(`${LINK}\n\nPosting text`, ASHBY_POSTING);

    expect(askedFields(fetchMock)).toEqual(["req_id", "deadline", "cover_letter"]);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(error).toBeNull();
    expect(fields).toEqual({
      company: "Acme",
      position_title: "Technical Program Manager",
      pay_low: 207000,
      pay_high: 285000,
      pay_unit: "year",
      location: "San Francisco, California, United States",
      req_id: "R-77",
      deadline: null,
      cover_letter: "required",
    });
  });

  test("a deadline the text states is kept, and a day that does not exist is dropped", async () => {
    stubModel({ deadline: "2026-12-01" });
    expect((await extractFields("Apply by December 1, 2026.", null)).fields.deadline).toBe("2026-12-01");

    for (const deadline of ["2026-13-45", "2026-02-30"]) {
      stubModel({ deadline });
      expect((await extractFields("Apply by then.", null)).fields.deadline).toBeNull();
    }
  });

  test("a req ID that only appears inside the link is kept", async () => {
    const workday = "https://acme.wd5.myworkdayjobs.com/en-US/careers/job/Austin-TX/Engineer_R12345";
    stubModel({ req_id: "R12345" });
    expect((await extractFields(`${workday}\n\nReq R12345`, null)).fields.req_id).toBe("R12345");

    stubModel({ req_id: "5" });
    expect((await extractFields(`${workday}\n\nJob 5`, null)).fields.req_id).toBe("5");
  });

  test("with no JSON-LD the model fills every field, and unstated or malformed answers stay empty", async () => {
    stubModel({ company: "Acme", position_title: "", pay_low: "120000", pay_high: -1, pay_unit: "week", location: null, deadline: "Dec 1", cover_letter: "maybe" });

    const { fields } = await extractFields("Acme is hiring.", null);

    expect(fields).toEqual({
      company: "Acme",
      position_title: null,
      pay_low: 120000,
      pay_high: null,
      pay_unit: null,
      location: null,
      req_id: null,
      deadline: null,
      cover_letter: null,
    });
  });

  test("a req ID that is the posting link's own UUID is dropped", async () => {
    stubModel({ req_id: "8fb1615c-34bf-47c4-a1d1-b7b2f836bbd3" });

    const { fields } = await extractFields(`${LINK}\n\nPosting text`, null);

    expect(fields.req_id).toBeNull();
  });

  test("a model failure keeps the JSON-LD fields and reports the error", async () => {
    globalThis.fetch = mock(async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch;
    process.env.OPENROUTER_API_KEY = "test-key";

    const { fields, error } = await extractFields("Posting text", ASHBY_POSTING);

    expect(error).toBe("OpenRouter 429: rate limited");
    expect(fields).toMatchObject({ company: "Acme", req_id: "8fb1615c-34bf-47c4-a1d1-b7b2f836bbd3", cover_letter: null });
  });

  test("an inverted pay range from the model is dropped", async () => {
    stubModel({ pay_low: 200, pay_high: 100 });

    const { fields } = await extractFields("Pay is 200 to 100.", null);

    expect(fields).toMatchObject({ pay_low: null, pay_high: null });
  });
});
