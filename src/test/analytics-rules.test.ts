import { describe, expect, it } from "vitest";
import { channelUrlFrom, clientStats } from "@/lib/analytics-rules";

describe("analytics rules", () => {
  it("accepts a bare channel ID", () => expect(channelUrlFrom("UC1234567890123456789012")).toBe("https://www.youtube.com/channel/UC1234567890123456789012"));
  it("uses the latest snapshot and averages CTR", () => {
    const s = clientStats([
      { client_id: "a", date: "2026-02-01", views: 200, subscribers: 20, watch_hours: 5, impressions_ctr: 6, top_videos: [] },
      { client_id: "a", date: "2026-01-01", views: 100, subscribers: 10, watch_hours: 2, impressions_ctr: 4, top_videos: [] },
    ], "a");
    expect(s.views).toBe(200);
    expect(s.subscribers).toBe(20);
    expect(s.avgCtr).toBe(5);
  });
});
