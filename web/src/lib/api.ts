type Outcome = { ok: true; res: Response } | { ok: false; error: string };

export const sendJson = (method: "POST" | "PATCH" | "PUT", path: string, body: unknown) =>
  request(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export async function request(path: string, init?: RequestInit): Promise<Outcome> {
  try {
    const res = await fetch(path, init);
    return res.ok ? { ok: true, res } : { ok: false, error: await errorOf(res) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const errorOf = (res: Response) =>
  res.json().then((body: { error: string }) => body.error, () => `Request failed with HTTP ${res.status}`);
