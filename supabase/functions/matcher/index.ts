// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";
import buildPrompt from "./prompt.ts";

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const TRINITY_MODEL = "arcee-ai/trinity-large-preview:free";

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

  const apiKey = Deno.env.get("LLM_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "LLM_KEY is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  let body: { job_description?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const { job_description: jobDescription, user_id: userId } = body;
  if (!jobDescription || !userId) {
    return new Response(
      JSON.stringify({
        error: "Missing required fields: job_description and user_id",
      }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // Fetch user metadata (including resume) server-side to avoid large request payloads
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: "User not found", details: userError?.message }),
      { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const userMetadata = user.user_metadata ?? {};
  const resume = userMetadata.resume ?? {};

  // Reject empty resume to avoid wasting LLM call and returning empty arrays
  const hasContent =
    (Array.isArray(resume.experiences) && resume.experiences.length > 0) ||
    (Array.isArray(resume.projects) && resume.projects.length > 0) ||
    (Array.isArray(resume.skills) && resume.skills.length > 0);
  if (!hasContent) {
    return new Response(
      JSON.stringify({
        error:
          "No resume found. Add your resume via the LinkedIn scraper (Profile → Connect Extension) or ensure your resume is saved to your account.",
      }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // Pass resume directly - it should have education, experiences, projects, skills, certifications at top level
  const prompt = buildPrompt(jobDescription, resume);

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
        max_tokens: 8192,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(
        JSON.stringify({
          error: "OpenRouter API error",
          details: errText,
          status: response.status,
        }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const data = await response.json();
    let text = data?.choices?.[0]?.message?.content ?? "";

    // Strip markdown code blocks if LLM wrapped the output
    const codeBlockMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (codeBlockMatch) {
      text = codeBlockMatch[1].trim();
    } else if (text.includes("```")) {
      text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
    }

    return new Response(
      JSON.stringify({ result: text }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Failed to call LLM",
        details: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
