/**
 * Extract title, description, locations from HTML.
 * No LLM - direct DOM/regex parsing.
 */

export interface ExtractedHtml {
  description: string | null;
  title: string | null;
  locations: string[];
}

/**
 * Extract locations from <div data-automation-id="locations">.
 * Workday uses this for job locations.
 */
function extractLocations(html: string): string[] {
  const locations: string[] = [];
  const openRe = /<div[^>]*data-automation-id=["']locations["'][^>]*>/gi;
  const openMatch = openRe.exec(html);
  if (!openMatch) return locations;

  const startIdx = openMatch.index + openMatch[0].length;
  let depth = 1;
  let i = startIdx;
  while (i < html.length && depth > 0) {
    const openDiv = html.indexOf("<div", i);
    const closeDiv = html.indexOf("</div>", i);
    if (closeDiv === -1) break;
    if (openDiv !== -1 && openDiv < closeDiv) {
      depth++;
      i = openDiv + 4;
    } else {
      depth--;
      if (depth === 0) {
        const inner = html.slice(startIdx, closeDiv);
        const text = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const parts = text.split(/[,|]|\s+and\s+/i).map((p) => p.trim()).filter(Boolean);
        for (const p of parts) {
          if (p.length > 2 && p.length < 100) locations.push(p);
        }
        return [...new Set(locations)];
      }
      i = closeDiv + 6;
    }
  }
  return locations;
}

/**
 * Extract description and title from HTML.
 * Meta tags first, then JSON-LD JobPosting.
 */
export function extractFromHtml(html: string): ExtractedHtml {
  let description: string | null = null;
  let title: string | null = null;

  const descPatterns = [
    /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i,
  ];
  for (const re of descPatterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) {
      description = m[1].trim();
      break;
    }
  }

  const titlePatterns = [
    /<meta[^>]+(?:name|property)=["'](?:title|og:title)["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:title|og:title)["']/i,
  ];
  for (const re of titlePatterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) {
      title = m[1].trim();
      break;
    }
  }

  if (!description || !title) {
    const ldJsonMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (ldJsonMatch) {
      for (const block of ldJsonMatch) {
        const jsonMatch = block.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
        const jsonStr = jsonMatch?.[1]?.trim();
        if (!jsonStr) continue;
        try {
          const data = JSON.parse(jsonStr);
          const items = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
          for (const item of items) {
            if (item?.["@type"] === "JobPosting") {
              if (!description && item.description) {
                description = typeof item.description === "string" ? item.description : item.description?.[0] ?? null;
              }
              if (!title && item.title) {
                title = typeof item.title === "string" ? item.title : item.title?.[0] ?? null;
              }
              if (description && title) break;
            }
          }
        } catch {
          /* invalid JSON */
        }
      }
    }
  }

  const locations = extractLocations(html);

  return { description, title, locations };
}
