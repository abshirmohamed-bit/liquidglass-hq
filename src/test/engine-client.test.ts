import { afterEach, describe, expect, it, vi } from "vitest";
import { engineClient } from "@/lib/engine.server";

afterEach(() => { delete process.env["ENGINE_API_KEY"]; vi.useRealTimers(); });

describe("engineClient (Build Pack Prompt 1)", () => {
  it("reports the connect-your-Engine state when URL or key is missing", async () => {
    const r = await engineClient("GET", "/v1/health", undefined, { baseUrl: null });
    expect(r).toEqual({ ok: false, error: expect.objectContaining({ code: "ENGINE_NOT_CONFIGURED" }) });
  });
  it("sends the Bearer key and retries once on 429 after Retry-After", async () => {
    process.env["ENGINE_API_KEY"] = "k1";
    const calls: RequestInit[] = [];
    const f = vi.fn(async (_u: string, init: RequestInit) => { calls.push(init); return calls.length === 1 ? new Response("", { status: 429, headers: { "Retry-After": "0" } }) : new Response(JSON.stringify({ success: true, ok: 1 }), { status: 200 }); });
    const r = await engineClient("GET", "/v1/health", undefined, { baseUrl: "https://e.test", fetchImpl: f as unknown as typeof fetch });
    expect(f).toHaveBeenCalledTimes(2);
    expect((calls[0]!.headers as Record<string, string>)["Authorization"]).toBe("Bearer k1");
    expect(r.ok).toBe(true);
  });
  it("maps Engine errors to { code, message }", async () => {
    process.env["ENGINE_API_KEY"] = "k1";
    const f = async () => new Response(JSON.stringify({ success: false, error: { code: "BAD_INPUT", message: "nope" } }), { status: 400 });
    const r = await engineClient("POST", "/v1/assets", { a: 1 }, { baseUrl: "https://e.test", fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ ok: false, error: { code: "BAD_INPUT", message: "nope" } });
  });
});
