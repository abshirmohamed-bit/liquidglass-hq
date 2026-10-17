/**
 * engineClient — the ONE place every crayZmundo Engine call goes through (Build Pack Prompt 1).
 * Adds the Bearer key, retries once on 429 after Retry-After, maps failures to { code, message }.
 * Server-only: the key never reaches the browser.
 */
export type EngineError = { code: string; message: string };
export type EngineResult<T = unknown> = { ok: true; data: T } | { ok: false; error: EngineError };
type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export async function engineBaseUrl(): Promise<string | null> {
  // An env var wins over the stored setting: it is how a local Engine is used
  // in development and how a self-hosted deployment pins its own address.
  const fromEnv = process.env["ENGINE_URL"];
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "ENGINE_URL").limit(1).maybeSingle();
  if (!data?.value) return null;
  try { const v = JSON.parse(data.value); return typeof v === "string" && v ? v.replace(/\/+$/, "") : null; } catch { return data.value.replace(/\/+$/, ""); }
}

export async function engineClient<T = unknown>(method: Method, path: string, body?: unknown, opts: { baseUrl?: string | null; fetchImpl?: typeof fetch } = {}): Promise<EngineResult<T>> {
  const key = process.env["ENGINE_API_KEY"];
  const base = opts.baseUrl !== undefined ? opts.baseUrl : await engineBaseUrl();
  if (!base || !key) return { ok: false, error: { code: "ENGINE_NOT_CONFIGURED", message: "Connect your crayZmundo Engine in Settings (ENGINE_URL and ENGINE_API_KEY)." } };
  const f = opts.fetchImpl ?? fetch;
  const send = () => f(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : null,
  });
  try {
    let res = await send();
    if (res.status === 429) {
      const wait = Math.min(Number(res.headers.get("Retry-After")) || 1, 30);
      await new Promise((r) => setTimeout(r, wait * 1000));
      res = await send();
    }
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
    const env = json as { success?: boolean; error?: { code?: string; message?: string } } | null;
    if (!res.ok || env?.success === false) {
      return { ok: false, error: { code: env?.error?.code ?? `HTTP_${res.status}`, message: env?.error?.message ?? (text.slice(0, 300) || res.statusText) } };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    return { ok: false, error: { code: "ENGINE_UNREACHABLE", message: e instanceof Error ? e.message : "Engine unreachable" } };
  }
}
