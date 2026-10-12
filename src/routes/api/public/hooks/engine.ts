import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { applyEngineEvent } from "@/lib/engine-events.server";

/**
 * Engine webhook receiver (Prompt 3). Signed with ENGINE_WEBHOOK_SECRET in
 * the x-crayz-signature header as t=<unix seconds>,v1=<hex> over "<t>.<body>".
 * Every valid event gets a 200 — including ones we ignore — because the
 * Engine retries non-200s five times with backoff.
 */
export const Route = createFileRoute("/api/public/hooks/engine")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const secret = process.env["ENGINE_WEBHOOK_SECRET"];
        const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(request.headers.get("x-crayz-signature") ?? "");
        if (!secret || !match) return new Response("Invalid signature", { status: 400 });
        const t = Number(match[1]);
        if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return new Response("Stale timestamp", { status: 400 });
        const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
        const got = Buffer.from(match[2] ?? "", "hex");
        const want = Buffer.from(expected, "hex");
        if (got.length !== want.length || !timingSafeEqual(got, want)) return new Response("Invalid signature", { status: 400 });
        let ev: { id?: unknown; type?: unknown; data?: unknown };
        try {
          ev = JSON.parse(raw);
        } catch {
          return new Response("Bad payload", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await applyEngineEvent(supabaseAdmin, {
          id: typeof ev.id === "string" ? ev.id : "",
          type: typeof ev.type === "string" ? ev.type : "",
          data: (ev.data ?? null) as Record<string, unknown> | null,
        });
        return new Response("ok", { status: 200 });
      },
    },
  },
});
