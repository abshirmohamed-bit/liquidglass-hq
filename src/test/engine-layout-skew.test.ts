import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";

/**
 * The app and the Engine deploy separately. Making "auto" the default layout
 * in the app while the Engine had never heard the word stopped every new job
 * with "formats must be 1 to 5 of [...]" — the video never got cut at all.
 *
 * An Engine that does not know a layout should cost you that layout, not the
 * clip. This stands up an Engine that rejects "auto" exactly as the deployed
 * one did, and drives the app's real job driver against it.
 */
type Row = Record<string, any>;

const KNOWN = ["black-box", "full-video", "split", "streamer", "title-subtitles"];
let server: Server;
let base = "";
const seen: unknown[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const sent = JSON.parse(body || "{}");
      seen.push(sent.formats);
      const bad = (sent.formats ?? []).filter((f: string) => !KNOWN.includes(f));
      res.setHeader("content-type", "application/json");
      if (bad.length) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: { code: "VALIDATION_ERROR",
          message: `formats must be 1 to 5 of ${JSON.stringify(KNOWN)}.` } }));
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify({ id: "ej_1", status: "queued" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
  process.env["ENGINE_URL"] = base;
  process.env["ENGINE_API_KEY"] = "devkey";
});

afterAll(() => { server.close(); });

function fakeDb(jobs: Row[]) {
  const updates: Row[] = [];
  const api = (rows: Row[]): any => ({
    select: () => api(rows),
    in: () => api(rows),
    eq: () => api(rows),
    order: () => api(rows),
    limit: async () => ({ data: rows, error: null }),
    update(patch: Row) { updates.push(patch); return { eq: async () => ({ data: null, error: null }) }; },
  });
  return { updates, from: () => api(jobs) };
}

const job = (layouts: string[]): Row => ({
  id: "job-1", status: "QUEUED", stage: null, progress: 0, engine_job_id: null,
  clip_count: "auto", clip_length: "auto", coverage: "BEST_MOMENTS", suggested_count: null,
  range_start_ms: null, range_end_ms: null, genre: null, mode: "AUTO", prompt: null,
  must_include: null, headline_top_n: null, alternates: false, edit_level: "full",
  aspect: "9:16", framing: "AUTO", language: null, source_asset_id: "src-1",
  formats: { layouts }, edits: null, created_at: "2026-01-01T00:00:00Z",
  caption_style_id: "bold_white",
  source_assets: { name: "v.mp4", engine_asset_id: "ast_1" },
});

describe("an Engine that has not heard of a layout", () => {
  it("still cuts the video, falling back to one it knows", async () => {
    seen.length = 0;
    const { advanceActiveJobs } = await import("@/lib/clip-engine.server");
    const db = fakeDb([job(["auto"])]);
    await advanceActiveJobs(db as never, 1);

    expect(seen[0]).toEqual(["auto"]);          // tried the real choice first
    expect(seen[1]).toEqual(["full-video"]);    // then one the Engine knows
    const failed = db.updates.find((u) => u["status"] === "FAILED");
    expect(failed).toBeUndefined();
    expect(db.updates.some((u) => u["engine_job_id"] === "ej_1")).toBe(true);
  });

  it("does not second-guess a layout the Engine accepts", async () => {
    seen.length = 0;
    const { advanceActiveJobs } = await import("@/lib/clip-engine.server");
    await advanceActiveJobs(fakeDb([job(["split"])]) as never, 1);
    expect(seen).toEqual([["split"]]);
  });
});

describe("the headline brief reaching the Engine", () => {
  it("is sent with the job, from the video's own override", async () => {
    seen.length = 0;
    const bodies: any[] = [];
    const srv = createServer((req, res) => {
      let body = ""; req.on("data", (c) => (body += c));
      req.on("end", () => { bodies.push(JSON.parse(body || "{}"));
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ id: "ej_2", status: "queued" })); });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    process.env["ENGINE_URL"] = `http://127.0.0.1:${(srv.address() as any).port}`;
    const { advanceActiveJobs } = await import("@/lib/clip-engine.server");
    const row = job(["auto"]);
    row["edits"] = { title_brief: "phrase it as a question" };
    await advanceActiveJobs(fakeDb([row]) as never, 1);
    srv.close();
    expect(bodies[0].title_brief).toBe("phrase it as a question");
  });
});
