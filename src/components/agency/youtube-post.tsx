import { YOUTUBE_PRIVACY_LABELS, youtubeOptionsIssue, type YouTubeOptions, type YouTubePrivacy } from "@/lib/youtube-rules";

/** YouTube's direct-post settings: privacy (no default) and the made-for-kids declaration. */
export function YouTubePostSettings({ value, onChange, title, description }: {
  value: YouTubeOptions; onChange: (o: YouTubeOptions) => void; title: string; description: string;
}) {
  const set = (p: Partial<YouTubeOptions>) => onChange({ ...value, ...p });
  const issue = youtubeOptionsIssue(value, title, description);
  return <div className="editor-fields">
    <label>Who can see this
      <select value={value.privacy} onChange={(e) => set({ privacy: e.target.value as YouTubeOptions["privacy"] })}>
        <option value="" disabled>Choose…</option>
        {(Object.keys(YOUTUBE_PRIVACY_LABELS) as YouTubePrivacy[]).map((p) => <option key={p} value={p}>{YOUTUBE_PRIVACY_LABELS[p]}</option>)}
      </select>
    </label>
    <label className="lib-check"><input type="checkbox" checked={value.madeForKids} onChange={(e) => set({ madeForKids: e.target.checked })} />This video is made for kids</label>
    {issue && <p className="caption" style={{ color: "var(--warning, #FF9F0A)" }}>{issue}</p>}
    <p className="caption muted">Until Google verifies the crayZmundo app, API uploads stay private on your channel no matter what you pick here.</p>
  </div>;
}
