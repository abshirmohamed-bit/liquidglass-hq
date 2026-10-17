const ZIP_LIB = "https://unpkg.com/fflate@0.8.2/esm/browser.js";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, Scissors, Play, Copy, Star, ThumbsDown, Download, Share2, Merge, FileCode, Captions, ClipboardCheck } from "lucide-react";
import { EmptyState, LoadingGrid } from "./kit";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Distribute } from "./posts";
import { reviewData, updateClip, setClipStatus, trimClip, duplicateClip, mergeClips, startExport, shareJob, clipPreview } from "@/lib/review.functions";
import { CLIP_STATUSES, FLAG_FILTERS, defaultJob, filterClips, fromLabel, formatPrecise, parsePrecise, trimIssue, transcriptWords, sliceWords, snapToSentence, needsReexport, srtFor, timelineFile, mergeIssue, type Resolution, type TimelineFormat } from "@/lib/review-rules";

type Data = Awaited<ReturnType<typeof reviewData>>;
type Clip = Data["clips"][number];
type Source = Data["sources"][number];
const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");
const pill = (s: string) => ({ FOUND: "tone-blue", APPROVED: "tone-green", REJECTED: "tone-red", EXPORTING: "tone-orange", READY: "tone-green", FAILED: "tone-red" } as Record<string, string>)[s] ?? "";
function save(name: string, body: BlobPart, type = "text/plain") { const u = URL.createObjectURL(new Blob([body], { type })); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); }

export function Review({ job: jobParam }: { job?: string | undefined }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["review"], queryFn: () => reviewData(), refetchInterval: (x) => (x.state.data?.clips.some((c) => c.status === "EXPORTING") ? 5000 : false) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["review"] });
  const [job, setJob] = useState<string | undefined>(jobParam);
  const [status, setStatus] = useState(""); const [source, setSource] = useState(""); const [mine, setMine] = useState(false);
  const [flags, setFlags] = useState<string[]>([]); const [search, setSearch] = useState(""); const [sort, setSort] = useState<"score" | "time">("score");
  const [view, setView] = useState<"grid" | "list">("grid"); const [sel, setSel] = useState<string[]>([]); const [focus, setFocus] = useState(0);
  const [trim, setTrim] = useState<Clip | null>(null); const [preview, setPreview] = useState<Clip | null>(null); const [scoreOf, setScoreOf] = useState<Clip | null>(null);
  const [res, setRes] = useState<Resolution>("HD");
  const d = q.data;
  useEffect(() => { if (!job && !jobParam && d) setJob(defaultJob(d.jobs ?? [])); }, [d, job, jobParam]);
  const srcById = useMemo(() => new Map((d?.sources ?? []).map((s) => [s.id, s])), [d]);
  const clips = useMemo(() => {
    if (!d) return [];
    const withText = d.clips.map((c) => { const s = c.source_asset_id ? srcById.get(c.source_asset_id) : undefined; return { ...c, transcriptText: sliceWords(transcriptWords(s?.transcript), c.start_ms ?? 0, c.end_ms ?? 0).map((w) => w.text).join(" ") }; });
    return filterClips(withText, { job, status: status || undefined, source: source || undefined, mine, me: d.me, flags, q: search, sort });
  }, [d, job, status, source, mine, flags, search, sort, srcById]);

  async function act(ids: string[], s: "APPROVED" | "REJECTED") { try { await setClipStatus({ data: { ids, status: s } }); await refresh(); } catch (e) { err(e); } }
  async function exportClips(ids: string[]) {
    try {
      const r = await startExport({ data: { ids, resolution: res } });
      await refresh();
      if (!r.started) { toast.error(r.failed[0]?.error ?? "Only approved clips can be exported."); return; }
      toast.success(`${r.started} clip${r.started === 1 ? "" : "s"} rendering on the Engine — you can close this tab.`);
      if (r.failed.length) toast.error(`${r.failed.length} could not start: ${r.failed[0]!.error}`);
    } catch (e) { err(e); }
  }
  // Keyboard: A approve, R reject, arrows move, Cmd/Ctrl+K search.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); document.getElementById("review-search")?.focus(); return; }
      if ((e.target as HTMLElement)?.closest("input,textarea,select,[role=dialog]")) return;
      const c = clips[focus]; if (!c) return;
      if (e.key === "a") act([c.id], "APPROVED"); else if (e.key === "r") act([c.id], "REJECTED");
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") setFocus((f) => Math.min(clips.length - 1, f + 1));
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") setFocus((f) => Math.max(0, f - 1));
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  });
  const selected = clips.filter((c) => sel.includes(c.id));

  return <div className="page review-page">
    <header className="page-header"><div><h1>Review</h1><p className="page-subtitle">Approve, trim and export found clips. Nothing is rendered until Export.</p></div>
      {job && <Button variant="outline" onClick={async () => { try { const t = await shareJob({ data: { jobId: job } }); const url = `${location.origin}/review/${t}`; await navigator.clipboard.writeText(url).catch(() => {}); toast.success("Share link copied (valid 7 days)"); window.prompt("Share link (7 days, read-only)", url); } catch (e) { err(e); } }}><Share2 />Share link</Button>}
    </header>
    <section className="glass-panel filter-bar review-filters">
      <select aria-label="Job" value={job ?? ""} onChange={(e) => setJob(e.target.value || undefined)}><option value="">All jobs</option>{d?.jobs?.map((j) => <option key={j.id} value={j.id}>{new Date(j.created_at).toLocaleString()} · {j.status.toLowerCase()}</option>)}</select>
      <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{CLIP_STATUSES.map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}</select>
      <select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}><option value="">Any source</option>{d?.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <label className="lib-check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />Assigned to me</label>
      <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as "score" | "time")}><option value="score">By score</option><option value="time">Chronological</option></select>
      <Button size="sm" variant="ghost" onClick={() => setView(view === "grid" ? "list" : "grid")}>{view === "grid" ? "List view" : "Grid view"}</Button>
      <div className="review-flags">{FLAG_FILTERS.map((f) => <button key={f} className={`status-pill ${flags.includes(f) ? "tone-blue" : ""}`} aria-pressed={flags.includes(f)} onClick={() => setFlags((x) => (x.includes(f) ? x.filter((y) => y !== f) : [...x, f]))}>{f}</button>)}</div>
      <input id="review-search" aria-label="Find keywords or moments" placeholder="Find keywords or moments (Ctrl/Cmd+K)" value={search} onChange={(e) => setSearch(e.target.value)} />
    </section>
    {sel.length > 0 && <section className="glass-panel filter-bar" aria-label="Bulk actions">
      <strong>{sel.length} selected</strong>
      <Button size="sm" onClick={() => act(sel, "APPROVED")}><Check />Approve all</Button>
      <Button size="sm" variant="outline" onClick={() => act(sel, "REJECTED")}><X />Reject all</Button>
      <select aria-label="Resolution" value={res} onChange={(e) => setRes(e.target.value as Resolution)}><option value="HD">HD 1080×1920</option><option value="UHD">4K 2160×3840</option></select>
      <Button size="sm" onClick={() => exportClips(selected.filter((c) => c.status === "APPROVED").map((c) => c.id))}>Export approved</Button>
      <Button size="sm" variant="outline" onClick={async () => { void 0; const ready = selected.filter((c) => c.video_url); if (!ready.length) { toast.error("None of the selected clips are exported yet."); return; } const { zipSync } = (await import(/* @vite-ignore */ ZIP_LIB as string)) as { zipSync: (f: Record<string, Uint8Array>, o: { level: 0 }) => Uint8Array }; const files: Record<string, Uint8Array> = {}; for (const c of ready) files[`${(c.title ?? "clip").replace(/[^\w -]+/g, "")}-${c.id.slice(0, 6)}.mp4`] = new Uint8Array(await (await fetch(c.video_url!)).arrayBuffer()); save("clips.zip", zipSync(files, { level: 0 }).slice().buffer, "application/zip"); }}><Download />Download selected</Button>
      <Button size="sm" variant="outline" onClick={async () => { const bad = mergeIssue(selected); if (bad) { toast.error(bad); return; } try { await mergeClips({ data: { ids: sel } }); setSel([]); await refresh(); toast.success("Merged into a new clip"); } catch (e) { err(e); } }}><Merge />Merge</Button>
      <Button size="sm" variant="ghost" disabled title="Comes with Prompt 10">Schedule selected</Button>
      <Button size="sm" variant="ghost" onClick={() => toast.info("Open one clip in the editor and use “Apply to other clips”.")}>Apply my style</Button>
      <Button size="sm" variant="ghost" disabled title="Comes with Prompt 11">Edit with AI</Button>
    </section>}
    {q.isLoading ? <LoadingGrid count={6} className="lib-grid" height={300} /> : !clips.length ? <section className="glass-panel"><EmptyState icon={ClipboardCheck} title="No clips to review"
      hint="When a clip job finishes, every moment it found lands here to approve, trim and export."
      action={<Button asChild size="sm"><Link to="/clips" search={{ source: undefined }}>Start a clip job</Link></Button>} /></section> :
      <div className={view === "grid" ? "lib-grid review-grid" : "review-list"}>{clips.map((c, i) => <ClipCard key={c.id} c={c} focused={i === focus} data={d!} selected={sel.includes(c.id)}
        onSelect={(v) => setSel((x) => (v ? [...x, c.id] : x.filter((y) => y !== c.id)))} onAct={(s) => act([c.id], s)} onTrim={() => setTrim(c)} onPreview={() => setPreview(c)} onScore={() => setScoreOf(c)}
        onExport={() => exportClips([c.id])} res={res} setRes={setRes} refresh={refresh} source={c.source_asset_id ? srcById.get(c.source_asset_id) : undefined} search={search} />)}</div>}
    {trim && <TrimModal clip={trim} source={trim.source_asset_id ? srcById.get(trim.source_asset_id) : undefined} onClose={() => setTrim(null)} onSaved={async () => { setTrim(null); await refresh(); }} />}
    {preview && <PreviewModal clip={preview} source={preview.source_asset_id ? srcById.get(preview.source_asset_id) : undefined} search={search} onClose={() => setPreview(null)} onExport={() => { exportClips([preview.id]); setPreview(null); }} refresh={refresh} />}
    {scoreOf && <Modal title="Score details" onClose={() => setScoreOf(null)}><p><strong>Scene analysis:</strong> {scoreOf.scene_analysis || "No scene analysis for this clip."}</p><Transcript clip={scoreOf} source={scoreOf.source_asset_id ? srcById.get(scoreOf.source_asset_id) : undefined} search={search} /></Modal>}
  </div>;
}

function Grades({ c }: { c: Clip }) {
  const g = (c.score_breakdown ?? {}) as Record<string, number>;
  return <div className="review-grades">{(["hook", "flow", "value", "trend"] as const).map((k) => <span key={k}>{k[0]!.toUpperCase() + k.slice(1)} {typeof g[k] === "number" ? g[k] : "—"}</span>)}</div>;
}

function ClipCard({ c, data, selected, focused, onSelect, onAct, onTrim, onPreview, onScore, onExport, res, setRes, refresh, source, search }: {
  c: Clip; data: Data; selected: boolean; focused: boolean; onSelect: (v: boolean) => void; onAct: (s: "APPROVED" | "REJECTED") => void; onTrim: () => void; onPreview: () => void; onScore: () => void; onExport: () => void; res: Resolution; setRes: (r: Resolution) => void; refresh: () => Promise<void>; source?: Source | undefined; search: string;
}) {
  const [title, setTitle] = useState(c.title ?? ""); const [posting, setPosting] = useState(false);
  const upd = async (f: Parameters<typeof updateClip>[0]["data"]) => { try { await updateClip({ data: f }); await refresh(); } catch (e) { err(e); } };
  const reexport = needsReexport(c);
  const dur = (c.end_ms ?? 0) - (c.start_ms ?? 0);
  const fps = Number(source?.fps) || 30;
  const timeline = (fmt: TimelineFormat) => { const f = timelineFile(fmt, { title: c.title ?? "clip", sourceName: source?.name ?? "source", sourceUrl: source?.playUrl ?? "", fps, start_ms: c.start_ms ?? 0, end_ms: c.end_ms ?? 0, sourceMs: source?.duration_ms ?? c.end_ms ?? 0 }); save(f.name, f.body, "application/xml"); };
  return <article className={`glass-panel lib-card review-card${focused ? " focused" : ""}`} aria-label={c.title ?? "Clip"}>
    <label className="review-select"><input type="checkbox" aria-label="Select clip" checked={selected} onChange={(e) => onSelect(e.target.checked)} />#{c.index ?? "—"}</label>
    {c.status === "READY" && c.video_url ? <video src={c.video_url} poster={c.thumbnail_url ?? undefined} controls preload="metadata" /> : (c.thumbnail_url || source?.thumbnail_url) ? <img src={(c.thumbnail_url || source?.thumbnail_url)!} alt="" /> : <div className="lib-thumb"><Play /></div>}
    <input className="review-title" aria-label="Clip title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== c.title && upd({ id: c.id, title: title.trim() })} />
    <p className="caption muted">{Math.round(dur / 1000)}s · From {fromLabel(c.start_ms)} {c.alternate_of && <span className="status-pill tone-purple">Alt cut</span>} <span className={`status-pill ${pill(c.status)}`}>{c.status[0] + c.status.slice(1).toLowerCase()}</span></p>
    <button className="review-score" onClick={onScore} aria-label="Score details">{c.score ?? "—"}</button><Grades c={c} />
    {c.reason && <p className="caption">{c.reason}</p>}
    {c.error && <p className="caption" style={{ color: "var(--destructive)" }}>{c.error}</p>}
    {(c.edits as { client_feedback?: string } | null)?.client_feedback && <p className="caption">Client: {(c.edits as { client_feedback: string }).client_feedback}</p>}
    {search && (c as { transcriptText?: string }).transcriptText?.toLowerCase().includes(search.toLowerCase()) && <p className="caption">Matches transcript</p>}
    <div className="review-actions">
      <Button size="icon" variant="ghost" aria-label="Favorite" aria-pressed={c.favorite} onClick={() => upd({ id: c.id, favorite: !c.favorite })}><Star fill={c.favorite ? "currentColor" : "none"} /></Button>
      <Button size="icon" variant="ghost" aria-label="Dislike" aria-pressed={c.disliked} onClick={() => upd({ id: c.id, disliked: !c.disliked })}><ThumbsDown fill={c.disliked ? "currentColor" : "none"} /></Button>
      <select aria-label="Assign" value={c.assignee ?? ""} onChange={(e) => upd({ id: c.id, assignee: e.target.value || null })}><option value="">Unassigned</option>{data.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select>
    </div>
    <div className="review-actions">
      <Button size="sm" onClick={() => onAct("APPROVED")} disabled={c.status === "EXPORTING"}><Check />Approve</Button>
      <Button size="sm" variant="outline" onClick={() => onAct("REJECTED")} disabled={c.status === "EXPORTING"}><X />Reject</Button>
      <Button size="sm" variant="outline" onClick={onTrim} disabled={c.status === "EXPORTING" || !!(c.edits as { segments?: unknown } | null)?.segments}><Scissors />Trim</Button>
      <Button size="sm" variant="outline" onClick={onPreview}><Play />Preview</Button>
      <Button size="sm" variant="outline" onClick={async () => { try { await duplicateClip({ data: { id: c.id } }); await refresh(); toast.success("Duplicated"); } catch (e) { err(e); } }}><Copy />Duplicate</Button>
    </div>
    {(c.status === "APPROVED" || reexport) && <div className="review-actions">
      <select aria-label="Export resolution" value={res} onChange={(e) => setRes(e.target.value as Resolution)}><option value="HD">HD</option><option value="UHD">4K</option></select>
      <Button size="sm" onClick={onExport}>{reexport ? "Re-export" : "Export"}</Button>
      <span className="caption muted">Estimated {Math.max(1, Math.round((dur / 1000) * (res === "UHD" ? 4 : 1.2) / 60))} min</span>
    </div>}
    {c.status === "READY" && c.video_url && <div className="review-actions">
      <Button size="sm" asChild><a href={c.video_url} download target="_blank" rel="noreferrer"><Download />Download {c.resolution === "UHD" ? "4K" : "HD"}</a></Button>
      <Button size="sm" variant="outline" disabled={!transcriptWords(source?.transcript).length} title={transcriptWords(source?.transcript).length ? "" : "Transcribe the source first (Prompt 5)"} onClick={() => save(`${c.title ?? "clip"}.srt`, srtFor(transcriptWords(source?.transcript), c.start_ms ?? 0, c.end_ms ?? 0))}><Captions />Captions</Button>
      <select aria-label="Export timeline XML" value="" onChange={(e) => e.target.value && timeline(e.target.value as TimelineFormat)}><option value="">Timeline XML…</option><option value="fcpxml">Final Cut Pro</option><option value="premiere">Premiere Pro</option><option value="edl">DaVinci Resolve (EDL)</option></select>
      <Button size="sm" variant="ghost" disabled title="Formats studio comes with Prompt 6">Formats</Button>
      <Button size="sm" onClick={() => setPosting(true)}>Post</Button>
    </div>}
    <div className="review-actions"><Button size="sm" variant="outline" asChild><Link to="/editor/$clipId" params={{ clipId: c.id }}>Edit captions & title</Link></Button></div>
    {posting && <Distribute clip={c} onClose={() => setPosting(false)} />}
  </article>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="review-modal-back" onClick={onClose}><div role="dialog" aria-label={title} className="glass-panel review-modal" onClick={(e) => e.stopPropagation()}><header className="page-header"><h2>{title}</h2><Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}><X /></Button></header>{children}</div></div>;
}

function Transcript({ clip, source, search, only }: { clip: Clip; source?: Source | undefined; search: string; only?: boolean }) {
  const words = sliceWords(transcriptWords(source?.transcript), clip.start_ms ?? 0, clip.end_ms ?? 0);
  if (!words.length) return <p className="caption muted">No transcript yet — transcripts arrive with Prompt 5.</p>;
  const q = search.trim().toLowerCase();
  return <p className={`prose review-transcript${only ? " only" : ""}`}>{words.map((w, i) => <span key={i} title={fromLabel(w.start_ms)} className={q && w.text.toLowerCase().includes(q) ? "hl" : ""}>{i % 12 === 0 && <small className="muted">[{fromLabel(w.start_ms)}] </small>}{w.text} </span>)}</p>;
}

function PreviewModal({ clip, source, search, onClose, onExport, refresh }: { clip: Clip; source?: Source | undefined; search: string; onClose: () => void; onExport: () => void; refresh: () => Promise<void> }) {
  const [only, setOnly] = useState(false);
  // Ask the Engine to cut a real preview. Falls back to the exported file if there is one.
  const preview = useQuery({
    queryKey: ["clip-preview", clip.id],
    queryFn: () => clipPreview({ data: { clipId: clip.id } }),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const url = clip.video_url ?? preview.data?.url ?? null;
  return <Modal title={clip.title ?? "Preview"} onClose={onClose}>
    <label className="lib-check"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />Transcript only</label>
    {!only && (
      url
        ? <><span className="status-pill">{clip.video_url ? "Exported clip" : "Low-res preview"}</span>
            <video src={url} controls autoPlay className="review-preview" /></>
        : preview.isPending
          ? <p className="caption">Cutting a preview on the Engine — a few seconds…</p>
          : preview.isError
            ? <p className="caption warn">{(preview.error as Error).message}</p>
            : <>{clip.thumbnail_url && <img src={clip.thumbnail_url} alt="" />}<p>{clip.title}</p></>
    )}
    <Transcript clip={clip} source={source} search={search} only={only} />
    <p><strong>Scene analysis:</strong> {clip.scene_analysis || "—"}</p>
    <div className="review-actions">
      <Button size="sm" disabled title="Posting comes next">Publish</Button>
      <Button size="sm" onClick={onExport} disabled={clip.status !== "APPROVED" && !needsReexport(clip)}>Export</Button>
      {clip.video_url ? <Button size="sm" variant="outline" asChild><a href={clip.video_url} download>Download</a></Button> : <Button size="sm" variant="outline" disabled title="Export first">Download</Button>}
      <Button size="sm" variant="outline" asChild><Link to="/editor/$clipId" params={{ clipId: clip.id }}>Edit</Link></Button>
      {(["9:16", "1:1", "4:5", "16:9"] as const).map((a) => <Button key={a} size="sm" variant="ghost" disabled title="Comes with Prompt 5">{a}</Button>)}
      <Button size="sm" variant="outline" onClick={() => { const f = timelineFile("fcpxml", { title: clip.title ?? "clip", sourceName: source?.name ?? "source", sourceUrl: source?.playUrl ?? "", fps: Number(source?.fps) || 30, start_ms: clip.start_ms ?? 0, end_ms: clip.end_ms ?? 0, sourceMs: source?.duration_ms ?? 0 }); save(f.name, f.body, "application/xml"); }}><FileCode />Export timeline XML</Button>
      <Button size="sm" variant="outline" onClick={async () => { await duplicateClip({ data: { id: clip.id } }); await refresh(); toast.success("Duplicated"); }}><Copy />Duplicate</Button>
    </div>
  </Modal>;
}

function TrimModal({ clip, source, onClose, onSaved }: { clip: Clip; source?: Source | undefined; onClose: () => void; onSaved: () => void }) {
  const found = (clip.edits as { found?: { start_ms: number; end_ms: number } } | null)?.found ?? { start_ms: clip.start_ms ?? 0, end_ms: clip.end_ms ?? 0 };
  const [s, setS] = useState(formatPrecise(clip.start_ms ?? 0)); const [e, setE] = useState(formatPrecise(clip.end_ms ?? 0));
  const [snap, setSnap] = useState(false); const [peaks, setPeaks] = useState<number[] | null>(null); const [wave, setWave] = useState("");
  const words = transcriptWords(source?.transcript);
  const start = parsePrecise(s), end = parsePrecise(e);
  const bad = start == null || end == null ? "Use mm:ss.ms, for example 01:05.250" : trimIssue(start, end, found, source?.duration_ms);
  const winStart = Math.max(0, found.start_ms - 60_000), winEnd = Math.min(source?.duration_ms ?? found.end_ms + 60_000, found.end_ms + 60_000);
  async function loadWave() { if (!source?.playUrl) return; try { const { waveform } = await import("@/lib/media-render"); setPeaks(await waveform(source.playUrl, winStart, winEnd, 200, setWave)); setWave(""); } catch (x) { setWave(x instanceof Error ? x.message : "Waveform unavailable"); } }
  async function submit() {
    if (bad || start == null || end == null) return;
    const r = snap ? snapToSentence(words, start, end) : { start, end };
    try { await trimClip({ data: { id: clip.id, start_ms: Math.round(r.start), end_ms: Math.round(r.end) } }); toast.success("Saved"); onSaved(); } catch (x) { err(x); }
  }
  const pct = (ms: number) => `${((ms - winStart) / Math.max(1, winEnd - winStart)) * 100}%`;
  return <Modal title="Trim" onClose={onClose}>
    <div className="review-wave">{peaks ? peaks.map((p, i) => <i key={i} style={{ height: `${Math.max(2, p * 100)}%` }} />) : <Button size="sm" variant="outline" onClick={loadWave} disabled={!source?.playUrl}>{wave || "Show waveform"}</Button>}
      {start != null && end != null && <b style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }} />}</div>
    <p className="caption muted">Found at {formatPrecise(found.start_ms)} – {formatPrecise(found.end_ms)}. You can extend up to 60 s each way.</p>
    <div className="filter-bar"><label>Start <input aria-label="Start" value={s} onChange={(x) => setS(x.target.value)} /></label><label>End <input aria-label="End" value={e} onChange={(x) => setE(x.target.value)} /></label>
      <span>Duration {start != null && end != null && end > start ? formatPrecise(end - start) : "—"}</span>
      <label className="lib-check"><input type="checkbox" checked={snap} disabled={!words.length} onChange={(x) => setSnap(x.target.checked)} />Snap to sentence{!words.length && " (needs a transcript)"}</label></div>
    {words.length > 0 && <p className="prose caption">{sliceWords(words, (start ?? found.start_ms) - 10_000, (end ?? found.end_ms) + 10_000).map((w) => w.text).join(" ")}</p>}
    {bad && <p className="caption" style={{ color: "var(--destructive)" }}>{bad}</p>}
    <Button disabled={!!bad} onClick={submit}>Save</Button>
  </Modal>;
}
