import { useQuery } from "@tanstack/react-query";
import { tiktokCreatorInfo } from "@/lib/tiktok.functions";
import { PRIVACY_LABELS, tiktokConsent, tiktokOptionsIssue, type TikTokOptions } from "@/lib/tiktok-rules";

/** TikTok's required direct-post settings: account, privacy (no default), interactions, disclosure, consent. */
export function TikTokPostSettings({ channelId, value, onChange, durationSec }: {
  channelId: string; value: TikTokOptions; onChange: (o: TikTokOptions) => void; durationSec: number;
}) {
  const q = useQuery({ queryKey: ["tiktok-creator", channelId], queryFn: () => tiktokCreatorInfo({ data: { channelId } }), staleTime: 60_000, retry: false });
  const info = q.data;
  const set = (p: Partial<TikTokOptions>) => onChange({ ...value, ...p });
  if (q.isLoading) return <p className="caption muted">Checking your TikTok account…</p>;
  if (q.error || !info) return <p className="caption" style={{ color: "var(--destructive)" }}>{q.error instanceof Error ? q.error.message : "Couldn't reach TikTok."} Try reconnecting TikTok.</p>;
  const issue = tiktokOptionsIssue(value, info.privacy_level_options, durationSec, info.max_video_post_duration_sec);
  return <div className="editor-fields tiktok-settings">
    <div className="lib-card-head">
      {info.creator_avatar_url && <img src={info.creator_avatar_url} alt="" width={28} height={28} style={{ borderRadius: 999 }} />}
      <span>Posting to <strong>{info.creator_nickname}</strong> <span className="muted">@{info.creator_username}</span></span>
    </div>
    <label>Who can see this
      <select value={value.privacy} onChange={(e) => set({ privacy: e.target.value as TikTokOptions["privacy"] })}>
        <option value="" disabled>Choose…</option>
        {info.privacy_level_options.map((p) => <option key={p} value={p} disabled={value.brandedContent && p === "SELF_ONLY"}>{PRIVACY_LABELS[p] ?? p}</option>)}
      </select>
    </label>
    <div className="review-actions">
      <label className="lib-check"><input type="checkbox" disabled={info.comment_disabled} checked={value.allowComment} onChange={(e) => set({ allowComment: e.target.checked })} />Allow comments</label>
      <label className="lib-check"><input type="checkbox" disabled={info.duet_disabled} checked={value.allowDuet} onChange={(e) => set({ allowDuet: e.target.checked })} />Allow Duet</label>
      <label className="lib-check"><input type="checkbox" disabled={info.stitch_disabled} checked={value.allowStitch} onChange={(e) => set({ allowStitch: e.target.checked })} />Allow Stitch</label>
    </div>
    <label className="lib-check"><input type="checkbox" checked={value.disclose} onChange={(e) => set({ disclose: e.target.checked, ...(e.target.checked ? {} : { yourBrand: false, brandedContent: false }) })} />This video promotes a brand, product or service</label>
    {value.disclose && <div className="review-actions">
      <label className="lib-check"><input type="checkbox" checked={value.yourBrand} onChange={(e) => set({ yourBrand: e.target.checked })} />Your brand</label>
      <label className="lib-check"><input type="checkbox" checked={value.brandedContent} onChange={(e) => set({ brandedContent: e.target.checked, ...(e.target.checked && value.privacy === "SELF_ONLY" ? { privacy: "" } : {}) })} />Branded content</label>
    </div>}
    {value.disclose && (value.yourBrand || value.brandedContent) && <p className="caption muted">Your video will be labelled “{value.brandedContent ? "Paid partnership" : "Promotional content"}”.</p>}
    {issue && <p className="caption" style={{ color: "var(--warning, #FF9F0A)" }}>{issue}</p>}
    <p className="caption muted">{tiktokConsent(value)} After posting it can take a few minutes to appear on your profile.</p>
  </div>;
}
