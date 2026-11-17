import { describe, expect, test } from "bun:test";
import { EXTRACTED_FIELDS } from "../shared/applications";
import { fieldsFromJobPosting } from "./extract";
import { fieldMatches, loadExtractFixtures } from "./posting-fixtures";

// Known bugs in fieldsFromJobPosting; each case flips to a plain failure when fixed, so remove it then.
const KNOWN_FAILING: Record<string, string> = {
  "qualcomm location": 'addressRegion "CA,US" and country "US" are joined verbatim into "San Diego, CA,US, US"',
  "leidos company": 'the ATS prefixes a cost-center code: "00100 LEIDOS, INC."',
  "leidos location": 'addressLocality carries a site code and the country is appended: "2143 Annapolis Junction MD, United States of America"',
};

const fixtures = (await loadExtractFixtures()).filter((fixture) => fixture.jobPosting);
const testNames = fixtures.flatMap((fixture) => fixture.jsonLdStates.map((field) => `${fixture.slug} ${field}`));

describe("fieldsFromJobPosting on saved postings", () => {
  test("some fixture has JSON-LD", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  test("every known failure matches a real test", () => {
    expect(Object.keys(KNOWN_FAILING).filter((name) => !testNames.includes(name))).toEqual([]);
  });

  for (const fixture of fixtures) {
    const stated = fieldsFromJobPosting(fixture.jobPosting!);

    test(`${fixture.slug} states exactly the expected fields`, () => {
      expect(EXTRACTED_FIELDS.filter((field) => field in stated)).toEqual(fixture.jsonLdStates);
    });

    for (const field of fixture.jsonLdStates) {
      const name = `${fixture.slug} ${field}`;
      const check = () => expect(fieldMatches(fixture, field, stated[field]), `${field}: got ${JSON.stringify(stated[field])}`).toBe(true);
      if (name in KNOWN_FAILING) test.failing(`${name} (${KNOWN_FAILING[name]})`, check);
      else test(name, check);
    }
  }
});
