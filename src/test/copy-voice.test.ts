import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The AI writes every headline and description from its own clip. The
 * creator supplies only the KIND of line to write — once, for everything,
 * with a per-video override.
 *
 * brand_kits has carried `tone` and `copy_defaults` since the table was
 * made and nothing ever read either of them, so the risk here is a brief
 * that is saved and then quietly ignored.
 */
type Row = Record<string, any>;

function fakeDb(kit: Row | null, clip: Row) {
  return {
    from(name: string) {
      const row = name === "brand_kits" ? kit : clip;
      const api: any = {
        select: () => api,
        eq: () => api,
        update: () => ({ eq: async () => ({ error: null }) }),
        maybeSingle: async () => ({ data: row, error: null }),
        single: async () => ({ data: row, error: null }),
      };
      return api;
    },
  };
}

const clip = { title: "A title", captions: [{ text: "what was said" }], watermark_text: "@me", copy: {} };

beforeEach(() => { vi.resetModules(); });

describe("the saved house style", () => {
  it("is read from copy_defaults", async () => {
    const { savedBrief } = await import("@/lib/posts.functions");
    const db = fakeDb({ tone: null, copy_defaults: { title: "ask a question", caption: "hook first" } }, clip);
    expect(await savedBrief(db as never, "title")).toBe("ask a question");
    expect(await savedBrief(db as never, "caption")).toBe("hook first");
  });

  it("falls back to the older tone column for captions only", async () => {
    const { savedBrief } = await import("@/lib/posts.functions");
    const db = fakeDb({ tone: "warm and plain", copy_defaults: {} }, clip);
    expect(await savedBrief(db as never, "caption")).toBe("warm and plain");
    expect(await savedBrief(db as never, "title")).toBe("");
  });

  it("is empty rather than broken when nothing is saved", async () => {
    const { savedBrief } = await import("@/lib/posts.functions");
    expect(await savedBrief(fakeDb(null, clip) as never, "caption")).toBe("");
  });
});

describe("writing a description", () => {
  async function capture(kit: Row | null, tone?: string) {
    const seen: string[] = [];
    vi.doMock("@/lib/training.server", () => ({
      gatewayText: async (system: string, user: string) => {
        seen.push(system, user);
        return JSON.stringify({ TIKTOK: "a caption" });
      },
    }));
    const { writeCopyFor } = await import("@/lib/posts.functions");
    await writeCopyFor(fakeDb(kit, clip) as never, "c1", ["TIKTOK"] as never, tone);
    return seen;
  }

  it("asks for a hook, not a summary", async () => {
    const { HOOK_RULES } = await import("@/lib/copy-rules");
    const [system] = await capture(null);
    expect(system).toContain("first line is a hook");
    expect(system).toContain(HOOK_RULES);
  });

  it("uses the saved style when the caller gives none", async () => {
    const [, user] = await capture({ tone: null, copy_defaults: { caption: "hook first, hashtags last" } });
    expect(user).toContain("hook first, hashtags last");
  });

  it("lets a per-clip tone win over the saved style", async () => {
    const [, user] = await capture({ tone: null, copy_defaults: { caption: "saved style" } }, "just for this one");
    expect(user).toContain("just for this one");
    expect(user).not.toContain("saved style");
  });

  it("still writes something with no style saved at all", async () => {
    const [, user] = await capture(null);
    expect(user).toContain("punchy, natural");
  });
});

describe("rewriting one clip's headline", () => {
  async function capture(instruction: string, kit: Row | null = null) {
    const seen: string[] = [];
    vi.doMock("@/lib/training.server", () => ({
      gatewayText: async (system: string, user: string) => {
        seen.push(system, user);
        return "  \u201cThe line it wrote\u201d\nand a stray second line";
      },
    }));
    const { rewriteHeadlineFor } = await import("@/lib/posts.functions");
    const out = await rewriteHeadlineFor(fakeDb(kit, clip) as never, "c1", instruction);
    return { seen, out };
  }

  it("takes the creator's instruction for this clip", async () => {
    const { seen } = await capture("lead on the number he gave");
    expect(seen[1]).toContain("lead on the number he gave");
  });

  it("falls back to the saved style when no instruction is given", async () => {
    const { seen } = await capture("", { tone: null, copy_defaults: { title: "always a question" } });
    expect(seen[1]).toContain("always a question");
  });

  it("returns one clean line, not quotes or a list", async () => {
    const { out } = await capture("anything");
    expect(out).toBe("The line it wrote");
  });

  it("refuses rather than inventing one with no transcript", async () => {
    const { rewriteHeadlineFor } = await import("@/lib/posts.functions");
    const bare = fakeDb(null, { title: "t", captions: [] });
    await expect(rewriteHeadlineFor(bare as never, "c1", "x")).rejects.toThrow(/no transcript/);
  });
});
