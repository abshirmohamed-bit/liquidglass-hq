import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, X, ExternalLink, Download, Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { postsData, addManualChannel, removeChannel, queuePosts, resolveManualPost, cancelPost, writeCopy } from "@/lib/posts.functions";
import { COPY_LIMITS, copyIssue, postColumn, uploadLink, type Platform } from "@/lib/finish-rules";

const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");
const PLATFORMS = Object.keys(COPY_LIMITS) as Platform[];
const pname = (p: string) => ({ INSTAGRAM: "Instagram", YOUTUBE: "YouTube", TIKTOK: "TikTok", X: "X", FACEBOOK: "Facebook", LINKEDIN: "LinkedIn" } as Record<string, string>)[p] ?? p;
const COLS = ["Scheduled", "Due now", "Posting", "Posted", "Failed"] as const;
/** Rules box per platform (Prompt 7). */
const RULES: Record<Platform, string> = {
  INSTAGRAM: "Reels 9:16, up to 15 min, under 1 GB.", TIKTOK: "Private posts only until TikTok audits the app.", YOUTUBE: "Shorts are 180 s or less.",
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
  return <div className="page">
    <header className="page-header"><div><h1>Posts</h1><p className="page-subtitle">Schedule finished clips to your channels and track every post.</p></div>
      <div className="review-actions"><select aria-label="Clip to post" value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose a finished clip…</option>{d?.clips.map((c) => <option key={c.id} value={c.id}>{c.title ?? "Clip"}</option>)}</select>
        <Button disabled={!clip} onClick={() => setOpen(true)}>Post / schedule</Button></div></header>

    <section className="glass-panel">
      <h2>Channels</h2>
      <p className="caption muted">Automatic posting needs each platform's developer app connected. Until then, add your accounts as manual channels: at the scheduled time the post shows under "Due now" with the file, the caption and a button that opens the platform's upload page.</p>
      <div className="lib-grid">{d?.channels.map((c) => <article key={c.id} className="glass-panel lib-card"><strong>{pname(c.platform)}</strong><span>{c.handle}</span>
        <span className={`status-pill ${c.status === "CONNECTED" ? "tone-green" : c.status === "MANUAL" ? "tone-blue" : "tone-orange"}`}>{c.status[0] + c.status.slice(1).toLowerCase()}</span>
        <p className="caption muted">{RULES[c.platform as Platform]}</p>
        <Button size="sm" variant="ghost" aria-label="Remove channel" onClick={async () => { try { await removeChannel({ data: { id: c.id } }); await refresh(); } catch (e) { err(e); } }}><Trash2 />Remove</Button></article>)}</div>
      <div className="filter-bar"><select aria-label="Platform" value={newP} onChange={(e) => setNewP(e.target.value as Platform)}>{PLATFORMS.map((p) => <option key={p} value={p}>{pname(p)}</option>)}</select>
        <input aria-label="Handle" placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
        <Button size="sm" disabled={!handle.trim()} onClick={async () => { try { await addManualChannel({ data: { platform: newP, handle } }); setHandle(""); await refresh(); toast.success("Channel added"); } catch (e) { err(e); } }}><Plus />Add manual channel</Button></div>
    </section>

    <section className="filter-bar"><select aria-label="Filter platform" value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="">All platforms</option>{PLATFORMS.map((p) => <option key={p} value={p}>{pname(p)}</option>)}</select></section>
    <div className="posts-board">{COLS.map((col) => <section key={col} className="glass-panel posts-col"><h3>{col}</h3>
      {posts.filter((p) => postColumn(p) === col).map((p) => { const c = clipById.get(p.clip_id); const ch = p.channel_id ? chanById.get(p.channel_id) : undefined;
        return <PostCard key={p.id} p={p} clip={c} handle={ch?.handle ?? ""} refresh={refresh} />; })}
    </section>)}</div>
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
  const [when, setWhen] = useState<"now" | "later">("now"); const [at, setAt] = useState(""); const [busy, setBusy] = useState(false); const [ai, setAi] = useState(false);
  const plats = [...new Set(chans.filter((c) => selected.includes(c.id)).map((c) => c.platform as Platform))];
  const text = (p: Platform) => copy[p] ?? base;
  const sec = (clip.duration_ms ?? 0) / 1000;
  const warn = (p: Platform) => [p === "YOUTUBE" && sec > 180 && "Over 180 s won't count as a Short.", p === "X" && sec > 140 && "X allows 140 s or less.", (p === "INSTAGRAM" || p === "TIKTOK" || p === "YOUTUBE") && clip.aspect && clip.aspect !== "9:16" && "Make a 9:16 version first (Editor → Layout).", copyIssue(p, p === "YOUTUBE" ? ytTitle : text(p))].filter(Boolean) as string[];
  async function confirm() {
    const bad = plats.flatMap((p) => { const i = copyIssue(p, p === "YOUTUBE" ? ytTitle : text(p)); return i ? [i] : []; });
    if (bad.length) { toast.error(bad[0]!); return; }
    if (when === "later" && !at) { toast.error("Pick a date and time."); return; }
    setBusy(true);
    try {
      const n = await queuePosts({ data: { clipId: clip.id, scheduledAt: when === "later" ? new Date(at).toISOString() : null, items: chans.filter((c) => selected.includes(c.id)).map((c) => ({ channelId: c.id, caption: text(c.platform as Platform), ...(c.platform === "YOUTUBE" ? { title: ytTitle } : {}) })) } });
      toast.success(`${n} post${n === 1 ? "" : "s"} ${when === "now" ? "queued" : "scheduled"}`); await qc.invalidateQueries({ queryKey: ["posts"] }); onClose();
    } catch (e) { err(e); } finally { setBusy(false); }
  }
  return <div className="review-modal-back" onClick={onClose}><div role="dialog" aria-label="Distribute" className="glass-panel review-modal" onClick={(e) => e.stopPropagation()}>
    <header className="page-header"><h2>Post “{clip.title ?? "clip"}”</h2><Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}><X /></Button></header>
    {!chans.length ? <p>No channels yet. Add your accounts on the Posts tab first.</p> : <>
      <div className="review-actions">{chans.map((c) => <label key={c.id} className="lib-check"><input type="checkbox" checked={selected.includes(c.id)} onChange={(e) => setOn((e.target.checked ? [...selected, c.id] : selected.filter((x) => x !== c.id)))} />{pname(c.platform)} {c.handle} {c.status === "MANUAL" && <span className="status-pill">manual</span>}</label>)}</div>
      <Button size="sm" variant="outline" disabled={ai || !plats.length} onClick={async () => { setAi(true); try { const r = await writeCopy({ data: { clipId: clip.id, platforms: plats } }); setCopy((x) => ({ ...x, ...r })); if (r.YOUTUBE) setYtTitle(r.YOUTUBE.split("\n")[0]!.slice(0, 100)); } catch (e) { err(e); } finally { setAi(false); } }}><Sparkles />{ai ? "Writing…" : "Write captions with AI"}</Button>
      {plats.map((p) => <div key={p} className="editor-fields"><strong>{pname(p)}</strong>
        {p === "YOUTUBE" && <label>Title <small className="muted">{ytTitle.length}/100</small><input value={ytTitle} onChange={(e) => setYtTitle(e.target.value)} /></label>}
        <label>{p === "YOUTUBE" ? "Description" : "Caption"} <small className="muted">{text(p).length}/{COPY_LIMITS[p]}</small><textarea rows={4} value={text(p)} onChange={(e) => setCopy((x) => ({ ...x, [p]: e.target.value }))} /></label>
        {warn(p).map((w) => <p key={w} className="caption" style={{ color: "var(--warning, #FF9F0A)" }}>{w}</p>)}</div>)}
      <div className="filter-bar"><label className="lib-check"><input type="radio" checked={when === "now"} onChange={() => setWhen("now")} />Post now</label><label className="lib-check"><input type="radio" checked={when === "later"} onChange={() => setWhen("later")} />Schedule</label>
        {when === "later" && <input type="datetime-local" aria-label="Schedule time" value={at} onChange={(e) => setAt(e.target.value)} />}</div>
      <Button onClick={confirm} disabled={busy || !selected.length}>{busy ? "Saving…" : "Confirm"}</Button></>}
  </div></div>;
}
