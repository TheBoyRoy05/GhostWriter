import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { QUESTIONS_PER_REQUEST, RELEVANCE_LEVELS, scoreQuestions } from "./jev";

type JevRequest = { model: string; state: string; questions: Record<string, { type: string; instructions: string; criteria: string[] }> };

// Answers each question with a score parsed from its instructions, so a test can tell which answer belongs to which question.
function stubJev(cost = 0.001) {
  const requests: JevRequest[] = [];
  spyOn(globalThis, "fetch").mockImplementation((async (_url: string, init: RequestInit) => {
    const request = JSON.parse(String(init.body)) as JevRequest;
    requests.push(request);
    const answers = Object.fromEntries(
      Object.entries(request.questions).map(([key, q]) => [key, { score: Number(q.instructions), confidence: 0.9 }]),
    );
    return Response.json({ answers, provider: "TypeSafe", usage: { cost } });
  }) as unknown as typeof fetch);
  return requests;
}

afterEach(() => mock.restore());

describe("scoreQuestions", () => {
  test("sends one score question per instruction with the posting as state and the given levels", async () => {
    const requests = stubJev();
    await scoreQuestions("key", "posting text", { a: "1" }, RELEVANCE_LEVELS);

    expect(requests).toHaveLength(1);
    expect(requests[0].model).toBe("typesafe/jev-1.13");
    expect(requests[0].state).toBe("posting text");
    expect(requests[0].questions.a.type).toBe("score");
    expect(requests[0].questions.a.criteria).toEqual(RELEVANCE_LEVELS);
  });

  test("batches at 32 questions per request and merges every answer", async () => {
    const requests = stubJev(0.001);
    const instructions = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`q${i}`, String(i % 4)]));

    const { answers, cost } = await scoreQuestions("key", "posting", instructions, RELEVANCE_LEVELS);

    expect(requests.map((r) => Object.keys(r.questions).length)).toEqual([QUESTIONS_PER_REQUEST, QUESTIONS_PER_REQUEST, 6]);
    expect(Object.keys(answers)).toHaveLength(70);
    expect(answers.q69.score).toBe(1);
    expect(cost).toBeCloseTo(0.003);
  });

  test("rejects a response that leaves a question unscored", async () => {
    spyOn(globalThis, "fetch").mockImplementation((async () => Response.json({ answers: { a: { score: 2, confidence: 1 } } })) as unknown as typeof fetch);
    await expect(scoreQuestions("key", "posting", { a: "x", b: "y" }, RELEVANCE_LEVELS)).rejects.toThrow("no score for 1 of 2");
  });

  test("surfaces an OpenRouter error status", async () => {
    spyOn(globalThis, "fetch").mockImplementation((async () => new Response("quota", { status: 402 })) as unknown as typeof fetch);
    await expect(scoreQuestions("key", "posting", { a: "x" }, RELEVANCE_LEVELS)).rejects.toThrow("OpenRouter 402: quota");
  });

  test("aborts a request that outlives its timeout", async () => {
    spyOn(AbortSignal, "timeout").mockImplementation(() => AbortSignal.abort(new DOMException("The operation timed out.", "TimeoutError")));
    spyOn(globalThis, "fetch").mockImplementation((async (_url: string, init: RequestInit) => {
      init.signal?.throwIfAborted();
      return Response.json({ answers: { a: { score: 1, confidence: 1 } } });
    }) as unknown as typeof fetch);

    await expect(scoreQuestions("key", "posting", { a: "x" }, RELEVANCE_LEVELS)).rejects.toThrow("timed out");
    expect(AbortSignal.timeout).toHaveBeenCalledWith(60_000);
  });
});
