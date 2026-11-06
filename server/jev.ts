const MODEL = "typesafe/jev-1.13";
// Jev caps one request at 32 questions.
export const QUESTIONS_PER_REQUEST = 32;
export const RELEVANCE_LEVELS = [
  "Irrelevant to the role",
  "Loosely related skills",
  "Clearly relevant to a responsibility or qualification",
  "Directly demonstrates a core responsibility of the role",
];

export type ScoreAnswer = { score: number; confidence: number };
type JevResponse = { answers: Record<string, ScoreAnswer>; provider?: string; usage?: { cost?: number } };

// Asks Jev to score each instruction 0-3 on `criteria` against `state`; the returned score is the expected level, so it ranks directly.
export async function scoreQuestions(apiKey: string, state: string, instructions: Record<string, string>, criteria: string[]) {
  const keys = Object.keys(instructions);
  const batches = [];
  for (let i = 0; i < keys.length; i += QUESTIONS_PER_REQUEST) batches.push(keys.slice(i, i + QUESTIONS_PER_REQUEST));
  const responses = await Promise.all(batches.map((batch) => scoreBatch(apiKey, state, batch, instructions, criteria)));

  const answers: Record<string, ScoreAnswer> = Object.assign({}, ...responses.map((r) => r.answers));
  const missing = keys.filter((key) => typeof answers[key]?.score !== "number");
  if (missing.length) throw new Error(`Jev returned no score for ${missing.length} of ${keys.length} questions`);
  return {
    answers,
    cost: responses.reduce((sum, r) => sum + (r.usage?.cost ?? 0), 0),
    providers: [...new Set(responses.map((r) => r.provider))],
  };
}

async function scoreBatch(apiKey: string, state: string, keys: string[], instructions: Record<string, string>, criteria: string[]) {
  const questions = Object.fromEntries(keys.map((key) => [key, { type: "score", instructions: instructions[key], criteria }]));

  const res = await fetch("https://openrouter.ai/api/v1/systemone", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, state, questions }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  return (await res.json()) as JevResponse;
}
