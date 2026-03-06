import { useState, useCallback } from "react";
import { supabaseUrl, supabaseAnonKey } from "@/lib/supabase";
import { parseHourlyRange } from "@/lib/job-url";

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

export type FetchResult =
  | { success: true; description: string; title: string | null; hourly_range: number[] | null }
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
    if (provider === "unknown") {
      return {
        success: false,
        error: "Unsupported job board. Currently only Workday URLs are supported.",
      };
    }

    setIsFetching(true);

    try {
      const functionsUrl = import.meta.env.DEV
        ? `${window.location.origin}/api/functions/v1/fetch-job`
        : `${supabaseUrl}/functions/v1/fetch-job`;

      const res = await fetch(functionsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey ?? "",
          Authorization: `Bearer ${supabaseAnonKey ?? ""}`,
        },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          error: data.error ?? `Failed to fetch: ${res.status} ${res.statusText}`,
        };
      }

      const { description, title } = data;
      if (!description) {
        return {
          success: false,
          error: "Could not find job description on this page.",
        };
      }

      const hourly_range = parseHourlyRange(description);

      return { success: true, description, title, hourly_range };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch URL";
      return { success: false, error: message };
    } finally {
      setIsFetching(false);
    }
  }, []);

  return { isFetching, fetchJobDescription };
}
