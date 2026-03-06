import { useState, useCallback } from "react";

/** CORS proxy - replace with your own backend in production for reliability */
const CORS_PROXY = "https://api.allorigins.win/raw?url=";

type JobBoardProvider = "workday" | "unknown";

function getJobBoardProvider(url: string): JobBoardProvider {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (
      host.includes(".myworkdayjobs.com") ||
      host.includes(".myworkdaysite.com") ||
      host.includes("workday.com")
    ) {
      return "workday";
    }
  } catch {
    /* invalid url */
  }
  return "unknown";
}

function extractFromHtml(html: string): { description: string | null; title: string | null } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const description = doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? null;
  const title = doc.querySelector('meta[name="title"]')?.getAttribute("content")?.trim() ?? null;
  return { description, title };
}

function extractJobData(html: string, provider: JobBoardProvider): { description: string | null; title: string | null } {
  const { description, title } = extractFromHtml(html);
  switch (provider) {
    case "workday":
      return { description, title };
    default:
      return { description: null, title: null };
  }
}

export type FetchResult =
  | { success: true; description: string; title: string | null }
  | { success: false; error: string };

export interface UseFetchJobDescriptionResult {
  isFetching: boolean;
  fetchJobDescription: (url: string) => Promise<FetchResult>;
}

export function useFetchJobDescription(): UseFetchJobDescriptionResult {
  const [isFetching, setIsFetching] = useState(false);

  const fetchJobDescription = useCallback(async (url: string): Promise<FetchResult> => {
    const trimmed = url.trim();
    if (!trimmed) {
      return { success: false, error: "URL is required." };
    }

    const provider = getJobBoardProvider(trimmed);
    console.log("[useFetchJobDescription] provider:", provider);
    if (provider === "unknown") {
      return {
        success: false,
        error: "Unsupported job board. Currently only Workday URLs are supported.",
      };
    }

    setIsFetching(true);

    try {
      const fetchUrl = `${CORS_PROXY}${encodeURIComponent(trimmed)}`;
      console.log("[useFetchJobDescription] fetching:", fetchUrl);
      const res = await fetch(fetchUrl);

      console.log("[useFetchJobDescription] response:", res.status, res.statusText, "ok:", res.ok);

      if (!res.ok) {
        const body = await res.text();
        console.log("[useFetchJobDescription] error body (first 500 chars):", body.slice(0, 500));
        return {
          success: false,
          error: `Failed to fetch: ${res.status} ${res.statusText}`,
        };
      }

      const html = await res.text();
      console.log("[useFetchJobDescription] html length:", html.length, "chars");

      const { description, title } = extractJobData(html, provider);

      if (!description) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const metaEl = doc.querySelector('meta[name="description"]');
        console.log("[useFetchJobDescription] meta description found:", !!metaEl);
        console.log("[useFetchJobDescription] meta content:", metaEl?.getAttribute("content")?.slice(0, 200));
        console.log("[useFetchJobDescription] html preview (first 1000 chars):", html.slice(0, 1000));
        return {
          success: false,
          error: "Could not find job description on this page.",
        };
      }

      return { success: true, description, title };
    } catch (err) {
      console.error("[useFetchJobDescription] fetch error:", err);
      const message = err instanceof Error ? err.message : "Failed to fetch URL";
      return { success: false, error: message };
    } finally {
      setIsFetching(false);
    }
  }, []);

  return { isFetching, fetchJobDescription };
}
