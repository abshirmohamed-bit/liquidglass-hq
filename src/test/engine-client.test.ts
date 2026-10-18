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
  it("waits out a cold start instead of calling a sleeping Engine dead", async () => {
    // The Engine stops itself when idle; Fly answers 503 while it boots.
    process.env["ENGINE_API_KEY"] = "k1";
    vi.useFakeTimers();
    let n = 0;
    const f = vi.fn(async () => {
      n += 1;
      if (n === 1) throw new TypeError("fetch failed");
      if (n === 2) return new Response("", { status: 503 });
      return new Response(JSON.stringify({ success: true, awake: true }), { status: 200 });
    });
    const pending = engineClient("GET", "/v1/health", undefined, {
      baseUrl: "https://e.test",
      fetchImpl: f as unknown as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(20_000);
    const r = await pending;
    expect(f).toHaveBeenCalledTimes(3);
    expect(r.ok).toBe(true);
  });
  it("gives up on a cold start that never wakes", async () => {
    process.env["ENGINE_API_KEY"] = "k1";
    vi.useFakeTimers();
    const f = vi.fn(async () => new Response("", { status: 503 }));
    const pending = engineClient("GET", "/v1/health", undefined, {
      baseUrl: "https://e.test",
      fetchImpl: f as unknown as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    const r = await pending;
    expect(f).toHaveBeenCalledTimes(4); // first try plus three waits
    expect(r).toEqual({ ok: false, error: expect.objectContaining({ code: "HTTP_503" }) });
  });
  it("maps Engine errors to { code, message }", async () => {
    process.env["ENGINE_API_KEY"] = "k1";
    const f = async () => new Response(JSON.stringify({ success: false, error: { code: "BAD_INPUT", message: "nope" } }), { status: 400 });
    const r = await engineClient("POST", "/v1/assets", { a: 1 }, { baseUrl: "https://e.test", fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ ok: false, error: { code: "BAD_INPUT", message: "nope" } });
  });
});
