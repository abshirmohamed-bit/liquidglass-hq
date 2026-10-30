import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, X, ExternalLink, Download, Copy, Sparkles, Send } from "lucide-react";
import { EmptyState, SectionHead } from "./kit";
import { Button } from "@/components/ui/button";
import { postsData, addManualChannel, removeChannel, queuePosts, resolveManualPost, cancelPost, writeCopy } from "@/lib/posts.functions";
import { startTikTokConnect, publishNow } from "@/lib/tiktok.functions";
import { TikTokPostSettings } from "./tiktok-post";
import { DEFAULT_TIKTOK_OPTIONS, tiktokOptionsIssue, type TikTokOptions } from "@/lib/tiktok-rules";
import { useEffect } from "react";
import { COPY_LIMITS, copyIssue, postColumn, uploadLink, type Platform } from "@/lib/finish-rules";

const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");
const PLATFORMS = Object.keys(COPY_LIMITS) as Platform[];
const pname = (p: string) => ({ INSTAGRAM: "Instagram", YOUTUBE: "YouTube", TIKTOK: "TikTok", X: "X", FACEBOOK: "Facebook", LINKEDIN: "LinkedIn" } as Record<string, string>)[p] ?? p;
const COLS = ["Scheduled", "Due now", "Posting", "Posted", "Failed"] as const;
/** What belongs in each column, so an empty one still explains itself. */
const COL_EMPTY: Record<(typeof COLS)[number], string> = {
  "Scheduled": "Posts waiting for their slot.",
  "Due now": "Manual posts ready to upload.",
  "Posting": "Uploads in progress.",
  "Posted": "Posts that went live.",
  "Failed": "Nothing has failed.",
};
/** Rules box per platform (Prompt 7). */
const RULES: Record<Platform, string> = {
  INSTAGRAM: "Reels 9:16, up to 15 min, under 1 GB.", TIKTOK: "Connect your account to post directly; posts stay private until TikTok approves the app.", YOUTUBE: "Shorts are 180 s or less.",
  X: "140 s and 512 MB or less; about $0.015 per post.", FACEBOOK: "Page posts.", LINKEDIN: "Feed posts.",
};

export function Posts() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["posts"], queryFn: () => postsData(), refetchInterval: 60_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["posts"] });
  const [platform, setPlatform] = useState(""); const [newP, setNewP] = useState<Platform>("INSTAGRAM"); const [handle, setHandle] = useState("");
  const [pick, setPick] = useState<string>(""); const [open, setOpen] = useState(false);
  const d = q.data;
  const clipById = useMemo(() => new Map((d?.clips ?? []).map((c) => [c.id, c])), [d]);
  const chanById = useMemo(() => new Map((d?.channels ?? []).map((c) => [c.id, c])), [d]);
  const posts = (d?.posts ?? []).filter((p) => !platform || p.platform === platform);
  const clip = pick ? clipById.get(pick) : undefined;
  const channels = d?.channels ?? [];
  const noClips = !d?.clips.length;
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("tiktok");
    if (!r) return;
    if (r === "connected") toast.success("TikTok connected"); else toast.error(`TikTok: ${r}`);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  return <div className="page">
    <header className="page-header">
      <div>
        <h1>Posts</h1>
        <p className="page-subtitle">Send a finished clip to your channels, then watch every post through to live.</p>
      </div>
      <div className="actions">
        <select aria-label="Clip to post" value={pick} onChange={(e) => setPick(e.target.value)} disabled={noClips}>
          <option value="">{noClips ? "No finished clips yet" : "Choose a finished clip…"}</option>
          {d?.clips.map((c) => <option key={c.id} value={c.id}>{c.title ?? "Clip"}</option>)}
        </select>
        <Button disabled={!clip} onClick={() => setOpen(true)}>Post or schedule</Button>
      </div>
    </header>

    <section className="glass-panel section">
      <SectionHead
        title="Channels"
        hint="Automatic posting needs each platform's developer app approved. Until then add an account as a manual channel: at the scheduled time the post appears under Due now with the file, the caption and a link straight to the upload page."
      />
      {channels.length ? <div className="channel-grid">{channels.map((c) => <article key={c.id} className="glass-panel lib-card">
        <div className="lib-card-head"><strong>{pname(c.platform)}</strong>
          <span className={`status-pill ${c.status === "CONNECTED" ? "tone-green" : c.status === "MANUAL" ? "tone-blue" : "tone-orange"}`}>{c.status[0] + c.status.slice(1).toLowerCase()}</span></div>
        <span className="caption">{c.handle}</span>
        <p className="caption">{RULES[c.platform as Platform]}</p>
        <div className="lib-actions"><button className="btn-chip" aria-label={`Remove ${c.handle}`} onClick={async () => { try { await removeChannel({ data: { id: c.id } }); await refresh(); } catch (e) { err(e); } }}><Trash2 />Remove</button></div>
      </article>)}</div> : <EmptyState icon={Send} title="No channels yet" hint="Add the accounts you post to. A manual channel works today; swap it to automatic once that platform approves your app." />}
      <div className="filter-bar" style={{ marginTop: "var(--s4)", marginBottom: 0 }}>
        <select aria-label="Platform" value={newP} onChange={(e) => setNewP(e.target.value as Platform)}>{PLATFORMS.map((p) => <option key={p} value={p}>{pname(p)}</option>)}</select>
        <input aria-label="Handle" placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
        <Button size="sm" variant="outline" onClick={async () => { try { const { url } = await startTikTokConnect(); window.location.href = url; } catch (e) { err(e); } }}><Plus />Connect TikTok</Button>
        <Button size="sm" disabled={!handle.trim()} onClick={async () => { try { await addManualChannel({ data: { platform: newP, handle } }); setHandle(""); await refresh(); toast.success("Channel added"); } catch (e) { err(e); } }}><Plus />Add manual channel</Button>
      </div>
    </section>

    <div className="section">
      <div className="section-head">
        <h2>Every post</h2>
        <div className="actions">
          <select aria-label="Filter platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">All platforms</option>{PLATFORMS.map((p) => <option key={p} value={p}>{pname(p)}</option>)}
          </select>
        </div>
      </div>
      <div className="posts-board">{COLS.map((col) => {
        const inCol = posts.filter((p) => postColumn(p) === col);
        return <section key={col} className="glass-panel posts-col">
          <header><h3>{col}</h3>{inCol.length > 0 && <span className="board-count">{inCol.length}</span>}</header>
          {inCol.length
            ? inCol.map((p) => { const c = clipById.get(p.clip_id); const ch = p.channel_id ? chanById.get(p.channel_id) : undefined;
                return <PostCard key={p.id} p={p} clip={c} handle={ch?.handle ?? ""} refresh={refresh} />; })
            : <p className="board-empty">{COL_EMPTY[col]}</p>}
        </section>;
      })}</div>
    </div>

    {open && clip && <Distribute clip={clip} onClose={() => { setOpen(false); void refresh(); }} />}
  </div>;
}

type PostRow = Awaited<ReturnType<typeof postsData>>["posts"][number];
type ClipRow = Awaited<ReturnType<typeof postsData>>["clips"][number];
function PostCard({ p, clip, handle, refresh }: { p: PostRow; clip?: ClipRow | undefined; handle: string; refresh: () => Promise<void> }) {
  const [url, setUrl] = useState("");
  const col = postColumn(p);
  const act = async (action: "POSTED" | "SKIPPED" | "RETRY" | "MANUAL") => { try { await resolveManualPost({ data: { id: p.id, action, ...(action === "POSTED" ? { url } : {}) } }); await refresh(); } catch (e) { err(e); } };
  const text = p.platform === "YOUTUBE" ? `${p.title ?? ""}\n\n${p.caption ?? ""}` : p.caption ?? "";
  return <article className="glass-panel lib-card post-card" aria-label={`${pname(p.platform ?? "")} post`}>
    {clip?.thumbnail_url && <img src={clip.thumbnail_url} alt="" />}
    <strong>{pname(p.platform ?? "")} · {handle}</strong>
    <span className="caption muted">{p.posted_at ? `Posted ${new Date(p.posted_at).toLocaleString()}` : p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : ""} · {p.mode.toLowerCase()}</span>
    <p className="caption">{(p.caption ?? "").slice(0, 120)}</p>
    {p.last_error && <p className="caption" style={{ color: "var(--destructive)" }}>{p.last_error}</p>}
    {p.post_url && <a href={p.post_url} target="_blank" rel="noreferrer" className="caption"><ExternalLink size={12} /> Open post</a>}
    {col === "Due now" && <div className="post-manual">
      <div className="review-actions">
        {clip?.video_url && <Button size="sm" asChild><a href={clip.video_url} download target="_blank" rel="noreferrer"><Download />File</a></Button>}
        <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(text).catch(() => {}); toast.success("Caption copied"); }}><Copy />Copy caption</Button>
        <Button size="sm" variant="outline" asChild><a href={uploadLink(p.platform as Platform, text)} target="_blank" rel="noreferrer"><ExternalLink />Open {pname(p.platform ?? "")}</a></Button>
      </div>
      <div className="filter-bar"><input aria-label="Post link" placeholder="Paste the post link" value={url} onChange={(e) => setUrl(e.target.value)} /><Button size="sm" disabled={!url} onClick={() => act("POSTED")}>Mark posted</Button><Button size="sm" variant="ghost" onClick={() => act("SKIPPED")}>Skip</Button></div>
    </div>}
    <div className="review-actions">
      {p.status === "QUEUED" && <Button size="sm" variant="ghost" onClick={async () => { try { await cancelPost({ data: { id: p.id } }); await refresh(); } catch (e) { err(e); } }}><X />Cancel</Button>}
      {p.status === "FAILED" && <><Button size="sm" variant="outline" onClick={() => act("RETRY")}>Retry</Button><Button size="sm" variant="outline" onClick={() => act("MANUAL")}>Post manually</Button></>}
    </div>
  </article>;
}

/** Distribute modal: channels, per-platform copy, Post now or Schedule. */
export function Distribute({ clip, onClose }: { clip: { id: string; title: string | null; duration_ms: number | null; aspect: string | null; watermark_text: string | null }; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["posts"], queryFn: () => postsData() });
  const chans = q.data?.channels ?? [];
  const [on, setOn] = useState<string[] | null>(null);
  const selected = on ?? chans.map((c) => c.id);
  const base = `${clip.title ?? ""}${clip.watermark_text ? `\n\nFollow ${clip.watermark_text}` : ""}`;
  const [copy, setCopy] = useState<Partial<Record<Platform, string>>>({});
  const [ytTitle, setYtTitle] = useState(`${(clip.title ?? "").slice(0, 90)} #Shorts`);
  const [when, setWhen] = useState<"now" | "later">("now"); const [at, setAt] = useState(""); const [busy, setBusy] = useState(false); const [ai, setAi] = useState(false); const [askCopy, setAskCopy] = useState("");
  const [tt, setTt] = useState<Record<string, TikTokOptions>>({});
  const ttChans = chans.filter((c) => selected.includes(c.id) && c.platform === "TIKTOK" && c.status === "CONNECTED");
  const plats = [...new Set(chans.filter((c) => selected.includes(c.id)).map((c) => c.platform as Platform))];
  const text = (p: Platform) => copy[p] ?? base;
  const sec = (clip.duration_ms ?? 0) / 1000;
  const warn = (p: Platform) => [p === "YOUTUBE" && sec > 180 && "Over 180 s won't count as a Short.", p === "X" && sec > 140 && "X allows 140 s or less.", (p === "INSTAGRAM" || p === "TIKTOK" || p === "YOUTUBE") && clip.aspect && clip.aspect !== "9:16" && "Make a 9:16 version first (Editor → Layout).", copyIssue(p, p === "YOUTUBE" ? ytTitle : text(p))].filter(Boolean) as string[];
  async function confirm() {
    const bad = plats.flatMap((p) => { const i = copyIssue(p, p === "YOUTUBE" ? ytTitle : text(p)); return i ? [i] : []; });
    if (bad.length) { toast.error(bad[0]!); return; }
    for (const c of ttChans) { const i = tiktokOptionsIssue(tt[c.id] ?? DEFAULT_TIKTOK_OPTIONS, [], sec, null); if (i) { toast.error(i); return; } }
    if (when === "later" && !at) { toast.error("Pick a date and time."); return; }
    setBusy(true);
    try {
      const n = await queuePosts({ data: { clipId: clip.id, scheduledAt: when === "later" ? new Date(at).toISOString() : null, items: chans.filter((c) => selected.includes(c.id)).map((c) => ({ channelId: c.id, caption: text(c.platform as Platform), ...(c.platform === "YOUTUBE" ? { title: ytTitle } : {}), ...(ttChans.some((t) => t.id === c.id) ? { tiktok: tt[c.id] as TikTokOptions & { privacy: "SELF_ONLY" } } : {}) })) } });
      toast.success(`${n.count} post${n.count === 1 ? "" : "s"} ${when === "now" ? "queued" : "scheduled"}`);
      if (n.autoIds.length) { toast.info("Uploading to TikTok…"); void publishNow({ data: { postIds: n.autoIds } }).then(() => { toast.success("Sent to TikTok. It may take a few minutes to appear on your profile."); void qc.invalidateQueries({ queryKey: ["posts"] }); }).catch(err); } await qc.invalidateQueries({ queryKey: ["posts"] }); onClose();
    } catch (e) { err(e); } finally { setBusy(false); }
  }
  return <div className="review-modal-back" onClick={onClose}><div role="dialog" aria-label="Distribute" className="glass-panel review-modal" onClick={(e) => e.stopPropagation()}>
    <header className="page-header"><h2>Post “{clip.title ?? "clip"}”</h2><Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}><X /></Button></header>
    {!chans.length ? <p>No channels yet. Add your accounts on the Posts tab first.</p> : <>
      <div className="review-actions">{chans.map((c) => <label key={c.id} className="lib-check"><input type="checkbox" checked={selected.includes(c.id)} onChange={(e) => setOn((e.target.checked ? [...selected, c.id] : selected.filter((x) => x !== c.id)))} />{pname(c.platform)} {c.handle} {c.status === "MANUAL" && <span className="status-pill">manual</span>}</label>)}</div>
      {/* The AI writes these from the clip. The box is for saying what THIS
          one should get at — blank uses the style saved in Settings. */}
      <div className="ed-row">
        <input
          value={askCopy}
          maxLength={300}
          aria-label="What these captions should highlight"
          placeholder="What should these highlight? e.g. lead on what he said about patience"
          onChange={(e) => setAskCopy(e.target.value)}
        />
        <Button size="sm" variant="outline" disabled={ai || !plats.length} onClick={async () => { setAi(true); try { const r = await writeCopy({ data: { clipId: clip.id, platforms: plats, ...(askCopy.trim() ? { tone: askCopy.trim() } : {}) } }); setCopy((x) => ({ ...x, ...r })); if (r["YOUTUBE"]) setYtTitle(r["YOUTUBE"].split("\n")[0]!.slice(0, 100)); } catch (e) { err(e); } finally { setAi(false); } }}><Sparkles />{ai ? "Writing…" : askCopy.trim() ? "Rewrite captions" : "Write captions with AI"}</Button>
      </div>
      {plats.map((p) => <div key={p} className="editor-fields"><strong>{pname(p)}</strong>
        {p === "YOUTUBE" && <label>Title <small className="muted">{ytTitle.length}/100</small><input value={ytTitle} onChange={(e) => setYtTitle(e.target.value)} /></label>}
        <label>{p === "YOUTUBE" ? "Description" : "Caption"} <small className="muted">{text(p).length}/{COPY_LIMITS[p]}</small><textarea rows={4} value={text(p)} onChange={(e) => setCopy((x) => ({ ...x, [p]: e.target.value }))} /></label>
        {p === "TIKTOK" && ttChans.map((c) => <TikTokPostSettings key={c.id} channelId={c.id} durationSec={sec} value={tt[c.id] ?? DEFAULT_TIKTOK_OPTIONS} onChange={(o) => setTt((x) => ({ ...x, [c.id]: o }))} />)}
        {warn(p).map((w) => <p key={w} className="caption" style={{ color: "var(--warning, #FF9F0A)" }}>{w}</p>)}</div>)}
      <div className="filter-bar"><label className="lib-check"><input type="radio" checked={when === "now"} onChange={() => setWhen("now")} />Post now</label><label className="lib-check"><input type="radio" checked={when === "later"} onChange={() => setWhen("later")} />Schedule</label>
        {when === "later" && <input type="datetime-local" aria-label="Schedule time" value={at} onChange={(e) => setAt(e.target.value)} />}</div>
      <Button onClick={confirm} disabled={busy || !selected.length}>{busy ? "Saving…" : "Confirm"}</Button></>}
  </div></div>;
}
