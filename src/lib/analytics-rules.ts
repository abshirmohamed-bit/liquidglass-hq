export type Snap = { client_id: string; date: string | null; views: number | null; subscribers: number | null; watch_hours: number | null; impressions_ctr: number | null; top_videos: unknown };
export type TopVideo = { title: string; views: number };
/** Accepts a youtube.com/channel/UC… URL, an @handle URL, a bare UC… ID or @handle. */
export function channelUrlFrom(input: string) {
  const v = input.trim();
  if (/^UC[\w-]{22}$/.test(v)) return `https://www.youtube.com/channel/${v}`;
  if (/^@[\w.-]+$/.test(v)) return `https://www.youtube.com/${v}`;
  return v;
}
export function series(snaps: Snap[], clientId: string) {
  return snaps.filter((s) => s.client_id === clientId && s.date).sort((a, b) => a.date!.localeCompare(b.date!));
}
export function clientStats(snaps: Snap[], clientId: string) {
  const rows = series(snaps, clientId);
  const latest = rows[rows.length - 1];
  const ctrs = rows.map((r) => r.impressions_ctr).filter((n): n is number => n != null);
  return {
    rows,
    subscribers: latest?.subscribers ?? null,
    views: latest?.views ?? null,
    avgCtr: ctrs.length ? ctrs.reduce((a, b) => a + b, 0) / ctrs.length : null,
    top: ((latest?.top_videos as TopVideo[] | null) ?? []).slice().sort((a, b) => b.views - a.views).slice(0, 5),
  };
}
