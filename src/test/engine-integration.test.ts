import { describe, expect, it } from "vitest";

/**
 * End-to-end against a real Engine: the app's own job driver submits a clip
 * job, the Engine cuts the video, and the clips land through the shared event
 * applier — the same path a signed webhook takes.
 *
 * Skipped unless ENGINE_URL and ENGINE_ASSET_ID are set, so the normal suite
 * stays offline. Run it with a local Engine:
 *   ENGINE_URL=http://127.0.0.1:8080 ENGINE_API_KEY=devkey \
 *   ENGINE_ASSET_ID=ast_xxx bunx vitest run src/test/engine-integration.test.ts
 */
const LIVE = !!process.env["ENGINE_URL"] && !!process.env["ENGINE_ASSET_ID"];

type Row = Record<string, any>;

/** The slice of the Supabase client this path touches, backed by arrays. */
function fakeDb(tables: Record<string, Row[]>) {
  const match = (row: Row, f: [string, any][]) =>
    f.every(([k, v]) => (Array.isArray(v) ? v.includes(row[k]) : row[k] === v));

  return {
    tables,
    from(name: string) {
      tables[name] ??= [];
      const rows = tables[name]!;
      const filters: [string, any][] = [];
      const api: any = {
        select() { return api; },
        eq(k: string, v: any) { filters.push([k, v]); return api; },
        in(k: string, v: any[]) { filters.push([k, v]); return api; },
        not() { return api; },
        is() { return api; },
        order() { return api; },
        limit() { return api; },
        maybeSingle: async () => ({ data: rows.find((r) => match(r, filters)) ?? null, error: null }),
        single: async () => ({ data: rows.find((r) => match(r, filters)) ?? null, error: null }),
        update(patch: Row) {
          return {
            eq(k: string, v: any) {
              rows.filter((r) => r[k] === v).forEach((r) => Object.assign(r, patch));
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(row: Row | Row[]) {
          (Array.isArray(row) ? row : [row]).forEach((r) => rows.push({ id: `row_${rows.length + 1}`, ...r }));
          return Promise.resolve({ error: null });
        },
        then(res: any) { return Promise.resolve({ data: rows.filter((r) => match(r, filters)), error: null }).then(res); },
      };
      return api;
    },
  } as any;
}

describe.skipIf(!LIVE)("the app drives the Engine and gets real clips", () => {
  it("submits a queued job, follows it, and stores the clips it cut", async () => {
    const { advanceActiveJobs } = await import("@/lib/clip-engine.server");

    const db = fakeDb({
      clip_jobs: [{
        id: "job-1", owner_id: "u1", created_by: "u1", engine_job_id: null,
        status: "QUEUED", stage: null, progress: 0,
        clip_count: 6, clip_length: { min_s: 30, max_s: 59 }, coverage: "BEST_MOMENTS",
        suggested_count: null, range_start_ms: null, range_end_ms: null,
        genre: "Auto", mode: "AUTO", prompt: "", must_include: [],
        headline_top_n: 6, alternates: false, edit_level: "full",
        aspect: "9:16", framing: "AUTO", language: "auto",
        source_asset_id: "src-1", formats: { layouts: ["streamer"] },
        created_at: new Date().toISOString(),
        source_assets: { name: "long.mp4", engine_asset_id: process.env["ENGINE_ASSET_ID"] },
      }],
      clips: [], notifications: [], audit_logs: [],
    });

    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await advanceActiveJobs(db, 3);
      if (["COMPLETED", "FAILED"].includes(db.tables["clip_jobs"][0].status)) break;
      await new Promise((r) => setTimeout(r, 1500));
    }

    const job = db.tables["clip_jobs"][0];
    expect(job.error ?? null).toBeNull();
    expect(job.status).toBe("COMPLETED");
    expect(job.engine_job_id).toMatch(/^job_/);

    const clips = db.tables["clips"];
    expect(clips.length).toBe(6);
    for (const c of clips) {
      expect(c.end_ms).toBeGreaterThan(c.start_ms);
      expect(c.engine_project_id).toMatch(/^prj_|^proj_/);
      expect(c.status).toBe("FOUND");
    }
    const ordered = [...clips].sort((a, b) => a.start_ms - b.start_ms);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].start_ms).toBeGreaterThanOrEqual(ordered[i - 1].end_ms);
    }
    expect(db.tables["notifications"].some((n: Row) => n["type"] === "CLIPS_READY")).toBe(true);
  }, 200_000);
});
