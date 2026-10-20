const ZIP_LIB = "https://unpkg.com/fflate@0.8.2/esm/browser.js";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, Scissors, Play, Copy, Star, Download, Share2, Merge, FileCode, Captions, ClipboardCheck, Trash2, MoreHorizontal, Pencil, Loader2, ChevronDown, UserRound } from "lucide-react";
import { EmptyState, LoadingGrid } from "./kit";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { Link } from "@tanstack/react-router";
import { finishSpec } from "@/lib/finish-rules";
import { Distribute } from "./posts";
import { reviewData, updateClip, setClipStatus, trimClip, duplicateClip, mergeClips, startExport, finishExport, shareJob, clipPreview, deleteClips } from "@/lib/review.functions";
import { CLIP_STATUSES, FLAG_FILTERS, defaultJob, filterClips, fromLabel, formatPrecise, parsePrecise, trimIssue, transcriptWords, sliceWords, snapToSentence, needsReexport, srtFor, timelineFile, mergeIssue, exportSize, type Resolution, type TimelineFormat } from "@/lib/review-rules";

type Data = Awaited<ReturnType<typeof reviewData>>;
type Clip = Data["clips"][number];
type Source = Data["sources"][number];
const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");

/**
 * What a person needs from a failure: what broke and what to do. The engine's
 * own output is kept on the tooltip for when that is not enough.
 */
function readableError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("no such filter") || m.includes("avfiltergraph"))
    return "The render failed on this clip's title text. Edit the title, then export again.";
  if (m.includes("ffmpeg failed")) return "The render failed. Try exporting again, or trim the clip slightly.";
  if (m.includes("interrupted")) return "The export was interrupted before it finished. Export again.";
  if (m.includes("never reached the engine")) return raw;
  return raw.length > 160 ? `${raw.slice(0, 157)}…` : raw;
}
const pill = (s: string) => ({ FOUND: "tone-blue", APPROVED: "tone-green", REJECTED: "tone-red", EXPORTING: "tone-orange", READY: "tone-green", FAILED: "tone-red" } as Record<string, string>)[s] ?? "";
function save(name: string, body: BlobPart, type = "text/plain") { const u = URL.createObjectURL(new Blob([body], { type })); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); }

/**
 * `embedded` means Videos is showing this for one video: the page chrome and
 * the job and source pickers belong to that screen, not to this one.
 */
export function Review({ job: jobParam, source: sourceParam, embedded }: { job?: string | undefined; source?: string | undefined; embedded?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["review"], queryFn: () => reviewData(), refetchInterval: (x) => (x.state.data?.clips.some((c) => c.status === "EXPORTING") ? 5000 : false) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["review"] });
  const [job, setJob] = useState<string | undefined>(jobParam);
  const [status, setStatus] = useState(""); const [source, setSource] = useState(sourceParam ?? ""); const [mine, setMine] = useState(false);
  // Chronological by default: a run of clips from one video should read in the
  // order the video says them, so a set makes sense watched end to end.
  const [flags, setFlags] = useState<string[]>([]); const [search, setSearch] = useState(""); const [sort, setSort] = useState<"score" | "time">("time");
  const [view, setView] = useState<"grid" | "list">("grid"); const [sel, setSel] = useState<string[]>([]); const [focus, setFocus] = useState(0);
  const [trim, setTrim] = useState<Clip | null>(null); const [preview, setPreview] = useState<Clip | null>(null); const [scoreOf, setScoreOf] = useState<Clip | null>(null);
  const [res, setRes] = useState<Resolution>("HD"); const [rendering, setRendering] = useState<Record<string, string>>({});
  const d = q.data;
  // Pinned to one video, every job for it belongs on screen, so the newest
  // job must not quietly become a filter.
  useEffect(() => { if (!sourceParam && !job && !jobParam && d) setJob(defaultJob(d.jobs ?? [])); }, [d, job, jobParam, sourceParam]);
  useEffect(() => { if (sourceParam) setSource(sourceParam); }, [sourceParam]);
  const srcById = useMemo(() => new Map((d?.sources ?? []).map((s) => [s.id, s])), [d]);
  const clips = useMemo(() => {
    if (!d) return [];
    const withText = d.clips.map((c) => { const s = c.source_asset_id ? srcById.get(c.source_asset_id) : undefined; return { ...c, transcriptText: sliceWords(transcriptWords(s?.transcript), c.start_ms ?? 0, c.end_ms ?? 0).map((w) => w.text).join(" ") }; });
    return filterClips(withText, { job, status: status || undefined, source: source || undefined, mine, me: d.me, flags, q: search, sort });
  }, [d, job, status, source, mine, flags, search, sort, srcById]);

  async function act(ids: string[], s: "APPROVED" | "REJECTED") { try { await setClipStatus({ data: { ids, status: s } }); await refresh(); } catch (e) { err(e); } }
  async function remove(ids: string[]) {
    const many = ids.length > 1;
    if (!window.confirm(many ? `Delete ${ids.length} clips? This cannot be undone.` : "Delete this clip? This cannot be undone.")) return;
    try { const r = await deleteClips({ data: { ids } }); setSel((x) => x.filter((i) => !ids.includes(i))); await refresh(); toast.success(`${r.deleted} clip${r.deleted === 1 ? "" : "s"} deleted`); } catch (e) { err(e); }
  }
  async function exportClips(ids: string[]) {
    if (!ids.length) { toast.error("Approve a clip first — only approved clips are exported."); return; }
    try {
      const r = await startExport({ data: { ids, resolution: res } });
      await refresh();
      if (r.engineQueued) toast.success(`${r.engineQueued} clip${r.engineQueued === 1 ? "" : "s"} rendering on the Engine — you can close this tab.`);
      if (r.engineFailed.length) toast.error(r.engineFailed[0]!.error);
      if (!r.jobs.length) {
        if (!r.engineQueued && !r.engineFailed.length) toast.error("Only approved clips can be exported.");
        return;
      }
      const { renderClip } = await import("@/lib/media-render");
      for (const j of r.jobs) {
        const c = d?.clips.find((x) => x.id === j.clipId); const size = exportSize(res, c?.aspect);
        try {
          const out = await renderClip(r.workspace, { ...j, w: size.w, h: size.h, finish: c ? finishSpec(c, j.segments) : null }, (s) => setRendering((m) => ({ ...m, [j.clipId]: s })));
          await finishExport({ data: { exportId: j.exportId, ...out } });
          toast.success(`${j.title} is ready`);
        } catch (e) { await finishExport({ data: { exportId: j.exportId, path: null, thumbPath: null, width: null, height: null, size: null, lengthSec: null, error: e instanceof Error ? e.message : "Render failed" } }); err(e); }
        setRendering((m) => { const n = { ...m }; delete n[j.clipId]; return n; }); await refresh();
      }
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

  return <div className={embedded ? "review-page" : "page review-page"}>
    {!embedded && <header className="page-header"><div><h1>Review</h1><p className="page-subtitle">Approve, trim and export found clips. Nothing is rendered until Export.</p></div>
      {job && <Button variant="outline" onClick={async () => { try { const t = await shareJob({ data: { jobId: job } }); const url = `${location.origin}/review/${t}`; await navigator.clipboard.writeText(url).catch(() => {}); toast.success("Share link copied (valid 7 days)"); window.prompt("Share link (7 days, read-only)", url); } catch (e) { err(e); } }}><Share2 />Share link</Button>}
    </header>}
    <section className="glass-panel filter-bar review-filters">
      {!sourceParam && <select aria-label="Job" value={job ?? ""} onChange={(e) => setJob(e.target.value || undefined)}><option value="">All jobs</option>{d?.jobs?.map((j) => <option key={j.id} value={j.id}>{new Date(j.created_at).toLocaleString()} · {j.status.toLowerCase()}</option>)}</select>}
      <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{CLIP_STATUSES.map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}</select>
      {!sourceParam && <select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}><option value="">Any source</option>{d?.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      <label className="lib-check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />Assigned to me</label>
      <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as "score" | "time")}><option value="time">In video order</option><option value="score">Best first</option></select>
      <Button size="sm" variant="ghost" onClick={() => setView(view === "grid" ? "list" : "grid")}>{view === "grid" ? "List view" : "Grid view"}</Button>
      <div className="review-flags">{FLAG_FILTERS.map((f) => <button key={f} className={`status-pill ${flags.includes(f) ? "tone-blue" : ""}`} aria-pressed={flags.includes(f)} onClick={() => setFlags((x) => (x.includes(f) ? x.filter((y) => y !== f) : [...x, f]))}>{f}</button>)}</div>
      <input id="review-search" aria-label="Find keywords or moments" placeholder="Find keywords or moments (Ctrl/Cmd+K)" value={search} onChange={(e) => setSearch(e.target.value)} />
    </section>
    {sel.length > 0 && <section className="glass-panel filter-bar" aria-label="Bulk actions">
      <strong>{sel.length} selected</strong>
      <Button size="sm" onClick={() => act(sel, "APPROVED")}><Check />Approve all</Button>
      <Button size="sm" variant="outline" onClick={() => act(sel, "REJECTED")}><X />Reject all</Button>
      <Button size="sm" variant="outline" onClick={() => remove(sel)}><Trash2 />Delete</Button>
      <select aria-label="Resolution" value={res} onChange={(e) => setRes(e.target.value as Resolution)}><option value="HD">HD 1080×1920</option><option value="UHD">4K 2160×3840</option></select>
      <Button size="sm" onClick={() => exportClips(selected.filter((c) => c.status === "APPROVED").map((c) => c.id))}>Export approved</Button>
      <Button size="sm" variant="outline" onClick={async () => { void 0; const ready = selected.filter((c) => c.video_url); if (!ready.length) { toast.error("None of the selected clips are exported yet."); return; } const { zipSync } = (await import(/* @vite-ignore */ ZIP_LIB as string)) as { zipSync: (f: Record<string, Uint8Array>, o: { level: 0 }) => Uint8Array }; const files: Record<string, Uint8Array> = {}; for (const c of ready) files[`${(c.title ?? "clip").replace(/[^\w -]+/g, "")}-${c.id.slice(0, 6)}.mp4`] = new Uint8Array(await (await fetch(c.video_url!)).arrayBuffer()); save("clips.zip", zipSync(files, { level: 0 }).slice().buffer, "application/zip"); }}><Download />Download selected</Button>
      <Button size="sm" variant="outline" onClick={async () => { const bad = mergeIssue(selected); if (bad) { toast.error(bad); return; } try { await mergeClips({ data: { ids: sel } }); setSel([]); await refresh(); toast.success("Merged into a new clip"); } catch (e) { err(e); } }}><Merge />Merge</Button>
      <Button size="sm" variant="ghost" onClick={() => toast.info("Open one clip in the editor and use “Apply to other clips”.")}>Apply my style</Button>
    </section>}
    {q.isLoading ? <LoadingGrid count={6} className="lib-grid" height={300} /> : !clips.length ? <section className="glass-panel"><EmptyState icon={ClipboardCheck} title="No clips to review"
      hint="When a clip job finishes, every moment it found lands here to approve, trim and export."
      action={<Button asChild size="sm"><Link to="/clips" search={{ source: undefined }}>Start a clip job</Link></Button>} /></section> :
      <div className={view === "grid" ? "lib-grid review-grid" : "review-list"}>{clips.map((c, i) => <ClipCard key={c.id} c={c} focused={i === focus} data={d!} selected={sel.includes(c.id)} rendering={rendering[c.id]}
        onSelect={(v) => setSel((x) => (v ? [...x, c.id] : x.filter((y) => y !== c.id)))} onAct={(s) => act([c.id], s)} onTrim={() => setTrim(c)} onPreview={() => setPreview(c)} onScore={() => setScoreOf(c)}
        onExport={() => exportClips([c.id])} onDelete={() => remove([c.id])} res={res} setRes={setRes} refresh={refresh} source={c.source_asset_id ? srcById.get(c.source_asset_id) : undefined} search={search} />)}</div>}
    {trim && <TrimModal clip={trim} source={trim.source_asset_id ? srcById.get(trim.source_asset_id) : undefined} onClose={() => setTrim(null)} onSaved={async () => { setTrim(null); await refresh(); }} />}
    {preview && <PreviewModal clip={d?.clips.find((x) => x.id === preview.id) ?? preview} source={preview.source_asset_id ? srcById.get(preview.source_asset_id) : undefined} search={search} onClose={() => setPreview(null)} onExport={() => exportClips([preview.id])} onAct={(s) => act([preview.id], s)} refresh={refresh} />}
    {scoreOf && <Modal title="Score details" onClose={() => setScoreOf(null)}><Grades c={scoreOf} />{scoreOf.reason && <p>{scoreOf.reason}</p>}<p><strong>Scene analysis:</strong> {scoreOf.scene_analysis || "No scene analysis for this clip."}</p><Transcript clip={scoreOf} source={scoreOf.source_asset_id ? srcById.get(scoreOf.source_asset_id) : undefined} search={search} /></Modal>}
  </div>;
}

function Grades({ c }: { c: Clip }) {
  // The Engine grades a clip in letters (A+, B); only numbers were ever
  // rendered, so every card showed four dashes and looked ungraded.
  const g = (c.score_breakdown ?? {}) as Record<string, string | number>;
  const show = (v: string | number | undefined) =>
    v === undefined || v === null || v === "" ? "—" : String(v);
  return <div className="review-grades">{(["hook", "flow", "value", "trend"] as const).map((k) => <span key={k}>{k[0]!.toUpperCase() + k.slice(1)} {show(g[k])}</span>)}</div>;
}

function ClipCard({ c, data, selected, focused, rendering, onSelect, onAct, onTrim, onPreview, onScore, onExport, onDelete, res, setRes, refresh, source, search }: {
  c: Clip; data: Data; selected: boolean; focused: boolean; rendering?: string | undefined; onSelect: (v: boolean) => void; onAct: (s: "APPROVED" | "REJECTED") => void; onTrim: () => void; onPreview: () => void; onScore: () => void; onExport: () => void; onDelete: () => void; res: Resolution; setRes: (r: Resolution) => void; refresh: () => Promise<void>; source?: Source | undefined; search: string;
}) {
  const [title, setTitle] = useState(c.title ?? ""); const [posting, setPosting] = useState(false);
  const upd = async (f: Parameters<typeof updateClip>[0]["data"]) => { try { await updateClip({ data: f }); await refresh(); } catch (e) { err(e); } };
  const reexport = needsReexport(c);
  const dur = (c.end_ms ?? 0) - (c.start_ms ?? 0);
  const fps = Number(source?.fps) || 30;
  const timeline = (fmt: TimelineFormat) => { const f = timelineFile(fmt, { title: c.title ?? "clip", sourceName: source?.name ?? "source", sourceUrl: source?.playUrl ?? "", fps, start_ms: c.start_ms ?? 0, end_ms: c.end_ms ?? 0, sourceMs: source?.duration_ms ?? c.end_ms ?? 0 }); save(f.name, f.body, "application/xml"); };
  const ready = c.status === "READY" && !!c.video_url;
  const exporting = c.status === "EXPORTING";
  const canExport = c.status === "APPROVED" || reexport;
  const thumb = c.thumbnail_url || source?.thumbnail_url;
  const hasTranscript = transcriptWords(source?.transcript).length > 0;
  return <article className={`glass-panel lib-card review-card${selected ? " is-selected" : ""}${focused ? " focused" : ""}`} aria-label={c.title ?? "Clip"}>
    <header className="review-card-head">
      <label className="review-select"><input type="checkbox" aria-label="Select clip" checked={selected} onChange={(e) => onSelect(e.target.checked)} /><span>Clip {c.index ?? "—"}</span></label>
      <span className={`status-pill ${pill(c.status)}`}>{exporting && <Loader2 size={12} className="animate-spin" />}{c.status === "FOUND" ? "To review" : c.status[0] + c.status.slice(1).toLowerCase()}</span>
      <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="More clip actions" title="More clip actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="review-menu">
          <DropdownMenuItem onSelect={onPreview}><Play />Preview</DropdownMenuItem>
          <DropdownMenuItem onSelect={onTrim} disabled={exporting || !!(c.edits as { segments?: unknown } | null)?.segments}><Scissors />Trim clip</DropdownMenuItem>
          {ready && <DropdownMenuItem onSelect={() => setPosting(true)}><Share2 />Post clip</DropdownMenuItem>}
          <DropdownMenuItem onSelect={onScore}>Score & analysis</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => upd({ id: c.id, favorite: !c.favorite })}><Star fill={c.favorite ? "currentColor" : "none"} />{c.favorite ? "Remove favorite" : "Favorite"}</DropdownMenuItem>
          <DropdownMenuSub><DropdownMenuSubTrigger><UserRound />Assign to</DropdownMenuSubTrigger><DropdownMenuSubContent><DropdownMenuRadioGroup value={c.assignee ?? ""} onValueChange={(value) => upd({ id: c.id, assignee: value || null })}><DropdownMenuRadioItem value="">Unassigned</DropdownMenuRadioItem>{data.members.map((m) => <DropdownMenuRadioItem key={m.user_id} value={m.user_id}>{m.name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuSubContent></DropdownMenuSub>
          <DropdownMenuItem onSelect={async () => { try { await duplicateClip({ data: { id: c.id } }); await refresh(); toast.success("Duplicated"); } catch (e) { err(e); } }}><Copy />Duplicate</DropdownMenuItem>
          {ready && <><DropdownMenuSeparator />{hasTranscript && <DropdownMenuItem onSelect={() => save(`${c.title ?? "clip"}.srt`, srtFor(transcriptWords(source?.transcript), c.start_ms ?? 0, c.end_ms ?? 0))}><Captions />Download subtitles</DropdownMenuItem>}<DropdownMenuSub><DropdownMenuSubTrigger><FileCode />Download timeline</DropdownMenuSubTrigger><DropdownMenuSubContent>{([['fcpxml', 'Final Cut Pro'], ['premiere', 'Premiere Pro'], ['edl', 'DaVinci Resolve']] as const).map(([fmt, label]) => <DropdownMenuItem key={fmt} onSelect={() => timeline(fmt)}>{label}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub></>}
          <DropdownMenuSeparator />
          {c.status !== "REJECTED" && <DropdownMenuItem disabled={exporting} onSelect={() => onAct("REJECTED")}><X />Reject clip</DropdownMenuItem>}
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}><Trash2 />Delete clip</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
    <Button type="button" variant="ghost" className="review-open" onClick={onPreview} aria-label={`Open ${c.title ?? "clip"}`}>
      {thumb ? <img src={thumb} alt="" loading="lazy" /> : <div className="lib-thumb"><Play /></div>}
      <span className="review-open-badge"><Play size={20} fill="currentColor" /></span>
      <span className="review-duration">{formatPrecise(dur).split(".")[0]}</span>
    </Button>
    <div className="review-card-body">
      <textarea rows={2} className="review-title" aria-label="Clip title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== c.title && upd({ id: c.id, title: title.trim() })} />
      <div className="review-card-meta"><span>From {fromLabel(c.start_ms)} · {c.aspect ?? "9:16"}</span><Button size="sm" variant="ghost" className="review-score" onClick={onScore} aria-label="Score details" title="Score details"><span>{c.score ?? "—"}</span><span className="review-score-label">score</span></Button></div>
      {c.alternate_of && <span className="caption">Alternate cut</span>}
      {c.error && <p className="caption clip-error" title={c.error}>{readableError(c.error)}</p>}
      {(c.edits as { client_feedback?: string } | null)?.client_feedback && <p className="caption">Client: {(c.edits as { client_feedback: string }).client_feedback}</p>}
      {search && (c as { transcriptText?: string }).transcriptText?.toLowerCase().includes(search.toLowerCase()) && <p className="caption">Matches transcript</p>}
      {reexport && <p className="review-pending">Saved edits · export to update video</p>}
      <footer className="review-card-footer">
        <Button size="sm" variant="outline" asChild disabled={exporting}><Link to="/editor/$clipId" params={{ clipId: c.id }}><Pencil />Edit</Link></Button>
        {exporting ? <Button size="sm" disabled><Loader2 className="animate-spin" />Rendering</Button> : canExport ? <div className="review-export-control"><Button size="sm" onClick={onExport}><Download />{reexport ? "Re-export" : "Export"}</Button><DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" aria-label="Export resolution" title="Export resolution">{res === "UHD" ? "4K" : "HD"}<ChevronDown size={12} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Export resolution</DropdownMenuLabel><DropdownMenuRadioGroup value={res} onValueChange={(v) => setRes(v as Resolution)}><DropdownMenuRadioItem value="HD">HD · 1080p</DropdownMenuRadioItem><DropdownMenuRadioItem value="UHD">4K · 2160p</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div> : ready && c.video_url ? <Button size="sm" asChild><a href={c.video_url} download target="_blank" rel="noreferrer"><Download />Download</a></Button> : <Button size="sm" onClick={() => onAct("APPROVED")}><Check />Approve</Button>}
      </footer>
      {ready && reexport && c.video_url && <a className="review-previous" href={c.video_url} download target="_blank" rel="noreferrer">Download previous export</a>}
      {rendering && <p className="caption">{rendering}</p>}
    </div>
    {posting && <Distribute clip={c} onClose={() => setPosting(false)} />}
  </article>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  // Escape closes it, and it renders on the body so no ancestor's transform
  // can decide where "fixed" means.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const node = <div className="review-modal-back" onClick={onClose}><div role="dialog" aria-modal="true" aria-label={title} className="glass-panel review-modal" onClick={(e) => e.stopPropagation()}><header className="page-header"><h2>{title}</h2><Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}><X /></Button></header>{children}</div></div>;
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}

function Transcript({ clip, source, search, only }: { clip: Clip; source?: Source | undefined; search: string; only?: boolean }) {
  const words = sliceWords(transcriptWords(source?.transcript), clip.start_ms ?? 0, clip.end_ms ?? 0);
  if (!words.length) return <p className="caption muted">No transcript yet — transcripts arrive with Prompt 5.</p>;
  const q = search.trim().toLowerCase();
  return <p className={`prose review-transcript${only ? " only" : ""}`}>{words.map((w, i) => <span key={i} title={fromLabel(w.start_ms)} className={q && w.text.toLowerCase().includes(q) ? "hl" : ""}>{i % 12 === 0 && <small className="muted">[{fromLabel(w.start_ms)}] </small>}{w.text} </span>)}</p>;
}

function PreviewModal({ clip, source, search, onClose, onExport, onAct, refresh }: { clip: Clip; source?: Source | undefined; search: string; onClose: () => void; onExport: () => void; onAct: (s: "APPROVED" | "REJECTED") => void; refresh: () => Promise<void> }) {
  const [only, setOnly] = useState(false);
  const [posting, setPosting] = useState(false);
  // Ask the Engine to cut a real preview. Falls back to the exported file if there is one.
  //
  // Not while the clip is exporting: the Engine would render the same clip
  // twice at once, the two fight over the same cores, and the finished file
  // is moments away anyway. The list already polls every 5s while exporting,
  // so this reopens on its own with the real video.
  const rendering = clip.status === "EXPORTING";
  const preview = useQuery({
    queryKey: ["clip-preview", clip.id],
    queryFn: () => clipPreview({ data: { clipId: clip.id } }),
    staleTime: 10 * 60_000,
    retry: false,
    enabled: !clip.video_url && !rendering,
  });
  const url = clip.video_url ?? preview.data?.url ?? null;
  return <Modal title={clip.title ?? "Preview"} onClose={onClose}>
    <label className="lib-check"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />Transcript only</label>
    {!only && (
      url
        ? <><span className="status-pill">{clip.video_url ? "Exported clip" : "Low-res preview"}</span>
            <video src={url} controls autoPlay className="review-preview" /></>
        : rendering
          ? <>{clip.thumbnail_url && <img src={clip.thumbnail_url} alt="" />}
              <p className="caption">Rendering this clip now — the video appears here the moment it finishes.</p></>
          : preview.isFetching
            ? <p className="caption">Cutting a preview on the Engine — a few seconds…</p>
            : preview.isError
              ? <p className="caption warn">{(preview.error as Error).message}</p>
              : <>{clip.thumbnail_url && <img src={clip.thumbnail_url} alt="" />}<p>{clip.title}</p></>
    )}
    <Transcript clip={clip} source={source} search={search} only={only} />
    <p><strong>Scene analysis:</strong> {clip.scene_analysis || "—"}</p>
    <div className="review-actions">
      <Button size="sm" variant="outline" asChild><Link to="/editor/$clipId" params={{ clipId: clip.id }}><Pencil />Edit clip</Link></Button>
      {!rendering && (clip.status === "APPROVED" || needsReexport(clip)) && <Button size="sm" onClick={onExport}><Download />{needsReexport(clip) ? "Re-export" : "Export"}</Button>}
      {!rendering && !["APPROVED", "READY"].includes(clip.status) && <Button size="sm" onClick={() => onAct("APPROVED")}><Check />Approve</Button>}
      {clip.status === "READY" && clip.video_url && <><Button size="sm" asChild><a href={clip.video_url} download target="_blank" rel="noreferrer"><Download />Download</a></Button><Button size="sm" variant="outline" onClick={() => setPosting(true)}><Share2 />Post</Button></>}
    </div>
    {posting && <Distribute clip={clip} onClose={() => { setPosting(false); void refresh(); }} />}
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
