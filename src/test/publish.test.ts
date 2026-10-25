import { describe, expect, it, beforeEach, vi } from "vitest";
import { PUBLISHERS, BACKOFF_MINUTES, publishDuePosts, tokenFor } from "@/lib/publish.server";

/**
 * The half of posting that is the same on every platform. No uploader is
 * registered yet — the developer apps do not exist — so what matters most
 * here is what happens to a post it CANNOT publish: it must be left alone
 * for the manual flow, never failed for want of a feature nobody switched on.
 */
type Row = Record<string, any>;

function fakeDb(posts: Row[], creds: Row | null = null) {
  const updates: Record<string, Row> = {};
  const api = (rows: Row[], table: string): any => {
    const self: any = {
      select: () => self, eq: () => self, lte: () => self, order: () => self,
      maybeSingle: async () => ({ data: table === "channel_credentials" ? creds : rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: null }),
      limit: async () => ({ data: rows, error: null }),
      update(patch: Row) {
        return { eq: async (_c: string, id: string) => { updates[id] = { ...(updates[id] ?? {}), ...patch }; return { data: null, error: null }; } };
      },
    };
    return self;
  };
  return { updates, from: (t: string) => api(t === "posts" ? posts : [], t) };
}

const post = (over: Row = {}): Row => ({
  id: "p1", platform: "TIKTOK", caption: "hello", title: null, hashtags: [],
  privacy: null, attempts: 0, clip_id: "c1", channel_id: "ch1",
  clips: { video_url: "https://example.test/clip.mp4" },
  channels: { status: "CONNECTED", external_account_id: "acc" },
  ...over,
});

beforeEach(() => { for (const k of Object.keys(PUBLISHERS)) delete (PUBLISHERS as Row)[k]; });

describe("a platform with no uploader yet", () => {
  it("leaves the post queued for the manual flow", async () => {
    const db = fakeDb([post()]);
    expect(await publishDuePosts(db as never)).toBe(0);
    expect(db.updates["p1"]).toBeUndefined();     // untouched, not failed
  });
});

describe("publishing", () => {
  it("marks the post posted and records where it landed", async () => {
    (PUBLISHERS as Row)["TIKTOK"] = { publish: async () => ({ externalId: "x1", url: "https://tiktok.test/x1" }) };
    const db = fakeDb([post()], { access_token: "live", expires_at: null, refresh_token: null });
    expect(await publishDuePosts(db as never)).toBe(1);
    expect(db.updates["p1"]).toMatchObject({
      status: "POSTED", external_post_id: "x1", post_url: "https://tiktok.test/x1",
    });
  });

  it("will not post to a channel that was never connected", async () => {
    (PUBLISHERS as Row)["TIKTOK"] = { publish: async () => ({ externalId: "x", url: null }) };
    const db = fakeDb([post({ channels: { status: "MANUAL", external_account_id: null } })]);
    expect(await publishDuePosts(db as never)).toBe(0);
    expect(db.updates["p1"]).toBeUndefined();
  });

  it("fails a clip that was never exported, rather than uploading nothing", async () => {
    (PUBLISHERS as Row)["TIKTOK"] = { publish: async () => ({ externalId: "x", url: null }) };
    const db = fakeDb([post({ clips: { video_url: null } })]);
    await publishDuePosts(db as never);
    expect(db.updates["p1"]!["last_error"]).toMatch(/not been exported/);
  });
});

describe("when an upload fails", () => {
  async function attempt(attempts: number) {
    (PUBLISHERS as Row)["TIKTOK"] = { publish: async () => { throw new Error("platform said no"); } };
    const db = fakeDb([post({ attempts })], { access_token: "live", expires_at: null, refresh_token: null });
    await publishDuePosts(db as never);
    return db.updates["p1"]!;
  }

  it("waits and tries again rather than giving up", async () => {
    const patch = await attempt(0);
    expect(patch["status"]).toBe("QUEUED");
    expect(patch["attempts"]).toBe(1);
    expect(patch["last_error"]).toBe("platform said no");
    expect(Date.parse(patch["scheduled_at"])).toBeGreaterThan(Date.now());
  });

  it("backs off further each time", async () => {
    const first = Date.parse((await attempt(0))["scheduled_at"]);
    const later = Date.parse((await attempt(1))["scheduled_at"]);
    expect(later).toBeGreaterThan(first);
  });

  it("stops after its last try and says why, so it can be done by hand", async () => {
    const patch = await attempt(BACKOFF_MINUTES.length);
    expect(patch["status"]).toBe("FAILED");
    expect(patch["last_error"]).toBe("platform said no");
  });
});

describe("tokens", () => {
  const live = { publish: async () => ({ externalId: "x", url: null }) };

  it("uses a token that is still good", async () => {
    const db = fakeDb([], { access_token: "good", expires_at: null, refresh_token: "r" });
    expect(await tokenFor(db as never, "ch1", live)).toBe("good");
  });

  it("refreshes one that is about to expire mid-upload", async () => {
    const soon = new Date(Date.now() + 20_000).toISOString();
    const db = fakeDb([], { access_token: "stale", expires_at: soon, refresh_token: "r" });
    const withRefresh = { ...live, refresh: async () => ({ accessToken: "fresh", expiresAt: null }) };
    expect(await tokenFor(db as never, "ch1", withRefresh)).toBe("fresh");
  });

  it("says plainly when a channel was never connected", async () => {
    const db = fakeDb([], null);
    await expect(tokenFor(db as never, "ch1", live)).rejects.toThrow(/not connected/);
  });
});
