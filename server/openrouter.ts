const MODEL = process.env.OPENROUTER_MODEL ?? "arcee-ai/trinity-large-preview:free";

type Options = { maxTokens: number; temperature: number; signal?: AbortSignal };

export async function askOpenRouter(prompt: string, { maxTokens, temperature, signal }: Options): Promise<unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set in .env");

  const body = { model: MODEL, messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, temperature };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);

  const content: string = (await res.json())?.choices?.[0]?.message?.content ?? "";
  return JSON.parse(stripCodeFence(content));
}

function stripCodeFence(text: string) {
  return text.replace(/^\s*```(?:json)?\s*/, "").replace(/\s*```\s*$/, "").trim();
}
