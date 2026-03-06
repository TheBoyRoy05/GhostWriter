// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";
import { getJobBoardProvider, parseUrl } from "./url-parser.ts";
import { extractFromHtml } from "./desc-parser.ts";
import { buildExtractPrompt } from "./prompt.ts";
import { parseRateToHourly } from "./rate-parser.ts";

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const TRINITY_MODEL = "arcee-ai/trinity-large-preview:free";

async function callLLM(prompt: string): Promise<{ company?: string; roleId?: string; rate?: string | null } | null> {
  const apiKey = Deno.env.get("LLM_KEY");
  if (!apiKey) return null;

  try {
    const response = await fetch(OPENROUTER_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: TRINITY_MODEL,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        max_tokens: 1024,
        temperature: 0.2,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    let text = data?.choices?.[0]?.message?.content ?? "";

    const codeBlockMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (codeBlockMatch) {
      text = codeBlockMatch[1].trim();
    } else if (text.includes("```")) {
      text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
    }

    const parsed = JSON.parse(text);
    return {
      company: parsed.company ?? undefined,
      roleId: parsed.roleId ?? parsed.role_id ?? undefined,
      rate: parsed.rate ?? null,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const url = body.url?.trim();
  if (!url) {
    return new Response(
      JSON.stringify({ error: "URL is required" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const provider = getJobBoardProvider(url);
  if (provider === "unknown") {
    return new Response(
      JSON.stringify({ error: "Unsupported job board. Only Workday URLs are supported." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch: ${res.status} ${res.statusText}` }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const html = await res.text();
    const { description, title, locations } = extractFromHtml(html);

    if (!description) {
      return new Response(
        JSON.stringify({ error: "Could not find job description on this page." }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // LLM extracts company, roleId, rate (raw)
    const excerpt = description.slice(0, 5000);
    const prompt = buildExtractPrompt(url, excerpt);
    const llmResult = await callLLM(prompt);

    // Fallback to regex parse for company/roleId
    const urlParsed = parseUrl(url);
    const company = llmResult?.company ?? urlParsed?.company ?? "unknown";
    const roleId = llmResult?.roleId ?? urlParsed?.roleId ?? "manual";

    // Parse rate to hourly (code-side)
    const hourly_range = parseRateToHourly(llmResult?.rate) ?? null;

    return new Response(
      JSON.stringify({
        description,
        title,
        locations: locations.length > 0 ? locations : null,
        company,
        roleId,
        hourly_range,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch URL";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
