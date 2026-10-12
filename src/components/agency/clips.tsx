import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Scissors, Sparkles, Check, Pencil, ChevronRight, Film } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clipWorkspace, confirmClipCount, createClipJob, saveClipDefaults, syncClipJobs, type ClipWorkspace } from "@/lib/clip.functions";
import {
  ACTIVE_STATUSES, ASPECT_OPTIONS, CLIP_COUNT_MAX, CLIP_COUNT_MIN, CLIP_LENGTH_PRESETS, COVERAGE_OPTIONS, EDIT_LEVELS,
  FRAMING_OPTIONS, GENRES, GRADE_PRESETS, HEADLINE_TOP_DEFAULT, LAYOUT_OPTIONS, MAX_MUST_INCLUDE, MAX_PROMPT_CHARS,
  MODE_OPTIONS, SPOKEN_LANGUAGES, STAGE_LABELS, ZOOM_LEVELS, defaultGenreFor, formatClock, jobSummary, rangeIssue,
  sourceDurationIssue, statusPill, suggestedClipCount,
} from "@/lib/clip-rules";

const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");
type Job = ClipWorkspace["jobs"][number];
type Source = ClipWorkspace["sources"][number];

export function Clips() {
  const qc = useQueryClient();
  const search = useSearch({ from: "/_authenticated/clips" }) as { source?: string };
  const ws = useQuery({ queryKey: ["clips-workspace"], queryFn: () => clipWorkspace() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["clips-workspace"] });
  const [formOpen, setFormOpen] = useState(false);
  const completedSeen = useRef<Set<string>>(new Set());
  const jobs = ws.data?.jobs ?? [];
  const active = jobs.some((j) => ACTIVE_STATUSES.includes(j.status));

  // The Engine's polling stand-in: advance active jobs while the tab is open.
  useQuery({
    queryKey: ["clips-poll"],
    enabled: active,
    refetchInterval: 4000,
    queryFn: async () => { const r = await syncClipJobs(); if (r.changed) await refresh(); return r; },
  });

  // In-app "Clips are ready" toast when a job finishes.
  useEffect(() => {
    for (const j of jobs) {
      if (j.status === "COMPLETED") {
        if (completedSeen.current.size && !completedSeen.current.has(j.id)) toast.success("Clips are ready");
        completedSeen.current.add(j.id);
      }
    }
  }, [jobs]);

  const preselected = search.source && ws.data?.sources.some((s) => s.id === search.source) ? search.source : null;
  useEffect(() => { if (preselected) setFormOpen(true); }, [preselected]);

  return <div className="page clips-page">
    <header className="page-header">
      <div className="min-w-0">
        <h1>Clips</h1>
        <p className="page-subtitle">Send a source to the AutoClip pipeline and watch it move.</p>
      </div>
      <Button onClick={() => setFormOpen((v) => !v)}><Scissors />{formOpen ? "Close form" : "New clip job"}</Button>
    </header>

    <section className="glass-panel lib-strip" aria-label="Pipeline status">
      <div><span className="panel-label">Jobs in queue</span><strong>{ws.data ? ws.data.queue.pending : "—"}</strong></div>
      <div><span className="panel-label">Estimated wait</span><strong>{ws.data ? `${ws.data.queue.waitMinutes} min` : "—"}</strong></div>
      <div><span className="panel-label">Clips awaiting review</span><strong>{ws.data ? ws.data.badge : "—"}</strong></div>
    </section>

    {formOpen && ws.data && <ClipJobForm sources={ws.data.sources} music={ws.data.music} defaults={ws.data.defaults}
      queue={ws.data.queue} initialSourceId={preselected} onDone={async () => { setFormOpen(false); await refresh(); }} />}

    <h2 className="section-title">Jobs <span className="caption muted">newest first</span></h2>
    {ws.isLoading ? <p className="muted">Loading…</p>
      : jobs.length ? <div className="clip-jobs">{jobs.map((j) => <JobCard key={j.id} job={j} refresh={refresh} />)}</div>
      : <section className="glass-panel lib-empty"><p className="muted">No clip jobs yet. Pick a source and start clipping.</p></section>}
  </div>;
}

type FormState = {
  sourceId: string; rangeStart: string; rangeEnd: string; coverage: "BEST_MOMENTS" | "WHOLE_VIDEO" | "DONT_CLIP";
  countMode: "auto" | "fixed"; count: number; lengthPreset: string; lengthMinS: number; lengthMaxS: number;
  genre: string; mode: "AUTO" | "SPEECH" | "ENERGY" | "VISUAL"; prompt: string; mustInclude: string;
  headlineTopN: number; alternates: boolean; editLevel: "cuts_only" | "captions" | "cropped" | "full";
  aspect: "9:16" | "1:1" | "4:5" | "16:9"; layouts: string[]; framing: "auto" | "both" | "centre"; language: string; captionLanguage: string;
  removeSilences: boolean; removeFillers: boolean; zoom: "Subtle" | "Balanced" | "Dynamic" | "Max";
  autoTransitions: boolean; soundEffects: boolean; grade: "none" | "warm" | "cool" | "punchy";
  keywordHighlight: boolean; emojis: boolean; autoBroll: boolean; musicAssetId: string;
};

function ClipJobForm({ sources, music, defaults, queue, initialSourceId, onDone }: {
  sources: Source[]; music: ClipWorkspace["music"]; defaults: ClipWorkspace["defaults"];
  queue: ClipWorkspace["queue"]; initialSourceId: string | null; onDone: () => Promise<void>;
}) {
  const create = useServerFn(createClipJob);
  const save = useServerFn(saveClipDefaults);
  const t = defaults?.ai_toggles as Partial<FormState> | null;
  const [f, setF] = useState<FormState>({
    sourceId: initialSourceId ?? sources[0]?.id ?? "",
    rangeStart: "", rangeEnd: "",
    coverage: (t?.coverage as FormState["coverage"]) ?? "BEST_MOMENTS",
    countMode: "auto", count: 4,
    lengthPreset: (t?.lengthPreset as string) ?? "auto",
    lengthMinS: 45, lengthMaxS: 120,
    genre: "Auto", mode: (t?.mode as FormState["mode"]) ?? "AUTO",
    prompt: "", mustInclude: "",
    headlineTopN: (typeof t?.headlineTopN === "number" ? t.headlineTopN : HEADLINE_TOP_DEFAULT),
    alternates: false,
    editLevel: (t?.editLevel as FormState["editLevel"]) ?? "full",
    aspect: (defaults?.default_aspect as FormState["aspect"]) ?? "9:16",
    layouts: [defaults?.default_layout ?? "streamer"],
    framing: ((t?.framing as FormState["framing"]) ?? "auto"),
    language: "auto", captionLanguage: "same",
    removeSilences: !!t?.removeSilences, removeFillers: !!t?.removeFillers,
    zoom: (t?.zoom as FormState["zoom"]) ?? "Balanced",
    autoTransitions: !!t?.autoTransitions, soundEffects: !!t?.soundEffects,
    grade: (t?.grade as FormState["grade"]) ?? "none",
    keywordHighlight: !!t?.keywordHighlight, emojis: !!t?.emojis, autoBroll: false,
    musicAssetId: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<FormState>) => setF((cur) => ({ ...cur, ...patch }));
  const source = sources.find((s) => s.id === f.sourceId) ?? null;
  const duration = source?.duration_ms ?? null;
  const sourceProblem = source ? sourceDurationIssue(duration) : null;
  const span = f.rangeStart !== "" && f.rangeEnd !== "" ? Number(f.rangeEnd) * 1000 - Number(f.rangeStart) * 1000 : duration ?? 0;
  const rangeProblem = f.rangeStart !== "" || f.rangeEnd !== ""
    ? rangeIssue(f.rangeStart === "" ? null : Number(f.rangeStart) * 1000, f.rangeEnd === "" ? null : Number(f.rangeEnd) * 1000, duration)
    : null;
  const suggested = suggestedClipCount(span);
  const mustList = f.mustInclude.split("\n").map((s) => s.trim()).filter(Boolean);
  const formProblem = sourceProblem ?? rangeProblem
    ?? (mustList.length > MAX_MUST_INCLUDE ? `List at most ${MAX_MUST_INCLUDE} quotes or timestamps.` : null);

  const payload = () => ({
    sourceId: f.sourceId,
    rangeStartMs: f.rangeStart === "" ? null : Math.round(Number(f.rangeStart) * 1000),
    rangeEndMs: f.rangeEnd === "" ? null : Math.round(Number(f.rangeEnd) * 1000),
    coverage: f.coverage, clipCount: f.countMode === "auto" ? "auto" as const : f.count,
    lengthPreset: f.lengthPreset, lengthMinS: f.lengthMinS, lengthMaxS: f.lengthMaxS,
    genre: f.genre === "Auto" && source?.niche ? defaultGenreFor(source.niche) : f.genre,
    mode: f.mode, prompt: f.prompt, mustInclude: mustList.slice(0, MAX_MUST_INCLUDE),
    headlineTopN: f.headlineTopN, alternates: f.alternates, editLevel: f.editLevel, aspect: f.aspect,
    layouts: f.layouts as ("full_video" | "streamer" | "split" | "two_up" | "three_up" | "four_up" | "screenshare" | "black_box" | "title_subtitles")[],
    framing: (f.framing === "auto" ? "AUTO" : f.framing === "centre" ? "CENTER" : "BOTH"), language: f.language, captionLanguage: f.captionLanguage,
    extras: { removeSilences: f.removeSilences, removeFillers: f.removeFillers, zoom: f.zoom, autoTransitions: f.autoTransitions, soundEffects: f.soundEffects, grade: f.grade, keywordHighlight: f.keywordHighlight, emojis: f.emojis, autoBroll: f.autoBroll },
    brollAssetId: null, musicAssetId: f.musicAssetId || null,
  });

  async function start() {
    setBusy(true);
    try { await create({ data: payload() }); toast.success("Clip job queued"); await onDone(); }
    catch (e) { err(e); } finally { setBusy(false); }
  }
  async function saveDefaults() {
    try {
      await save({ data: {
        aspect: f.aspect, layout: f.layouts[0] as "streamer",
        aiToggles: { coverage: f.coverage, mode: f.mode, editLevel: f.editLevel, lengthPreset: f.lengthPreset, framing: (f.framing === "auto" ? "AUTO" : f.framing === "centre" ? "CENTER" : "BOTH"), removeSilences: f.removeSilences, removeFillers: f.removeFillers, zoom: f.zoom, autoTransitions: f.autoTransitions, soundEffects: f.soundEffects, grade: f.grade, keywordHighlight: f.keywordHighlight, emojis: f.emojis, headlineTopN: f.headlineTopN },
      } });
      toast.success("Saved as your defaults");
    } catch (e) { err(e); }
  }

  if (!sources.length) return <section className="glass-panel lib-empty"><p className="muted">No ready sources to clip. Upload or import a video in <Link to="/library">Library</Link> first.</p></section>;

  return <section className="glass-panel clip-form" aria-label="New clip job">
    <div className="clip-form-row">
      <label className="field"><span className="field-label">Source</span>
        <select aria-label="Source" value={f.sourceId} onChange={(e) => { set({ sourceId: e.target.value, genre: "Auto" }); }}>
          {sources.map((s) => {
            const issue = sourceDurationIssue(s.duration_ms);
            return <option key={s.id} value={s.id} disabled={!!issue}>{s.name}{issue ? ` — ${issue}` : ""}</option>;
          })}
        </select>
        {sourceProblem && <span className="caption text-destructive">{sourceProblem}</span>}
        {source && !sourceProblem && <span className="caption muted">{formatClock(duration)}{source.niche ? ` · ${source.niche}` : ""}</span>}
      </label>
      <div className="field">
        <span className="field-label">Only this part (optional)</span>
        <div className="range-inputs">
          <input aria-label="Range start (seconds)" type="number" min={0} placeholder="Start (s)" value={f.rangeStart} onChange={(e) => set({ rangeStart: e.target.value })} />
          <span className="caption muted">to</span>
          <input aria-label="Range end (seconds)" type="number" min={0} placeholder="End (s)" value={f.rangeEnd} onChange={(e) => set({ rangeEnd: e.target.value })} />
        </div>
        {rangeProblem && <span className="caption text-destructive">{rangeProblem}</span>}
      </div>
    </div>

    <div className="clip-form-row">
      <div className="field"><span className="field-label">Coverage</span>
        <div className="seg wrap">{COVERAGE_OPTIONS.map((o) => (
          <button key={o.value} type="button" className={f.coverage === o.value ? "active" : ""} title={o.hint} onClick={() => set({ coverage: o.value })}>{o.label}</button>
        ))}</div>
        <span className="caption muted">{COVERAGE_OPTIONS.find((o) => o.value === f.coverage)?.hint}</span>
      </div>
      <div className="field"><span className="field-label">Clips</span>
        <div className="seg wrap">
          <button type="button" className={f.countMode === "auto" ? "active" : ""} onClick={() => set({ countMode: "auto" })}>Let AI decide</button>
          <button type="button" className={f.countMode === "fixed" ? "active" : ""} onClick={() => set({ countMode: "fixed", count: Math.max(CLIP_COUNT_MIN, suggested) })}>Choose a number</button>
        </div>
        {f.countMode === "fixed" && <div className="range-inputs">
          <input aria-label="Number of clips" type="number" min={CLIP_COUNT_MIN} max={CLIP_COUNT_MAX} value={f.count}
            onChange={(e) => set({ count: Math.max(CLIP_COUNT_MIN, Math.min(CLIP_COUNT_MAX, Number(e.target.value) || CLIP_COUNT_MIN)) })} />
          <span className="caption muted">2–60</span>
        </div>}
        <span className="caption muted">AI suggests {suggested} clips <button type="button" className="link-chip" onClick={() => set({ countMode: "fixed", count: suggested })}>Accept</button> <button type="button" className="link-chip" onClick={() => set({ countMode: "fixed" })}>Change</button></span>
      </div>
    </div>

    <div className="clip-form-row">
      <div className="field"><span className="field-label">Clip length</span>
        <div className="seg wrap">
          <button type="button" className={f.lengthPreset === "auto" ? "active" : ""} onClick={() => set({ lengthPreset: "auto" })}>Auto (45–120s)</button>
          {CLIP_LENGTH_PRESETS.map((p) => <button key={p} type="button" className={f.lengthPreset === String(p) ? "active" : ""} onClick={() => set({ lengthPreset: String(p) })}>{p}s</button>)}
          <button type="button" className={f.lengthPreset === "custom" ? "active" : ""} onClick={() => set({ lengthPreset: "custom" })}>Custom</button>
        </div>
        {f.lengthPreset === "custom" && <div className="range-inputs">
          <input aria-label="Minimum length (seconds)" type="number" min={15} max={600} value={f.lengthMinS} onChange={(e) => set({ lengthMinS: Number(e.target.value) || 0 })} />
          <span className="caption muted">to</span>
          <input aria-label="Maximum length (seconds)" type="number" min={15} max={600} value={f.lengthMaxS} onChange={(e) => set({ lengthMaxS: Number(e.target.value) || 0 })} />
        </div>}
      </div>
      <div className="field"><span className="field-label">Genre</span>
        <select aria-label="Genre" value={f.genre} onChange={(e) => set({ genre: e.target.value })}>
          {GENRES.map((g) => <option key={g} value={g}>{g}{g === "Auto" && source?.niche ? ` (${defaultGenreFor(source.niche)})` : ""}</option>)}
        </select>
        <span className="caption muted">The source's niche picks the default.</span>
      </div>
    </div>

    <div className="clip-form-row">
      <div className="field"><span className="field-label">Mode</span>
        <div className="seg wrap">{MODE_OPTIONS.map((o) => (
          <button key={o.value} type="button" className={f.mode === o.value ? "active" : ""} title={o.hint} onClick={() => set({ mode: o.value })}>{o.label}</button>
        ))}</div>
        <span className="caption muted">{MODE_OPTIONS.find((o) => o.value === f.mode)?.hint}</span>
      </div>
      <div className="field"><span className="field-label">Steering prompt <span className="caption muted">({MAX_PROMPT_CHARS} characters)</span></span>
        <textarea aria-label="Steering prompt" maxLength={MAX_PROMPT_CHARS} rows={3} placeholder="Tell the finder what to chase or avoid…" value={f.prompt} onChange={(e) => set({ prompt: e.target.value })} />
      </div>
    </div>

    <div className="clip-form-row">
      <div className="field"><span className="field-label">Must include <span className="caption muted">(one quote or timestamp per line, up to {MAX_MUST_INCLUDE})</span></span>
        <textarea aria-label="Must include" rows={3} placeholder={'"the part about pricing"\n12:40'} value={f.mustInclude} onChange={(e) => set({ mustInclude: e.target.value })} />
        {mustList.length > MAX_MUST_INCLUDE && <span className="caption text-destructive">List at most {MAX_MUST_INCLUDE} quotes or timestamps.</span>}
      </div>
      <div className="field"><span className="field-label">Headline on top</span>
        <div className="range-inputs">
          <input aria-label="Headline on top N clips" type="number" min={0} max={50} value={f.headlineTopN} onChange={(e) => set({ headlineTopN: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} />
          <span className="caption muted">Top N clips (0 turns it off)</span>
        </div>
        <label className="lib-check"><input type="checkbox" checked={f.alternates} onChange={(e) => set({ alternates: e.target.checked })} />Make up to 2 alternate cuts for the top 3 moments</label>
      </div>
    </div>

    <div className="clip-form-row">
      <div className="field"><span className="field-label">Edit level</span>
        <div className="seg wrap">{EDIT_LEVELS.map((o) => <button key={o.value} type="button" className={f.editLevel === o.value ? "active" : ""} onClick={() => set({ editLevel: o.value })}>{o.label}</button>)}</div>
        <span className="field-label">Aspect</span>
        <div className="seg wrap">{ASPECT_OPTIONS.map((a) => <button key={a} type="button" className={f.aspect === a ? "active" : ""} onClick={() => set({ aspect: a })}>{a}</button>)}</div>
      </div>
      <div className="field"><span className="field-label">Layouts <span className="caption muted">(pick 1–5)</span></span>
        <div className="seg wrap">{LAYOUT_OPTIONS.map((o) => {
          const on = f.layouts.includes(o.value);
          return <button key={o.value} type="button" className={on ? "active" : ""} disabled={!on && f.layouts.length >= 5}
            onClick={() => set({ layouts: on ? f.layouts.filter((l) => l !== o.value).length ? f.layouts.filter((l) => l !== o.value) : f.layouts : [...f.layouts, o.value] })}>{o.label}</button>;
        })}</div>
        {f.layouts.includes("split") && <span className="caption muted">Split pulls B-roll from the Library B-roll tab.</span>}
      </div>
    </div>

    <div className="clip-form-row">
      <div className="field"><span className="field-label">Speaker framing</span>
        <select aria-label="Speaker framing" value={f.framing} onChange={(e) => set({ framing: e.target.value as FormState["framing"] })}>{FRAMING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <span className="field-label">Spoken language</span>
        <select aria-label="Spoken language" value={f.language} onChange={(e) => set({ language: e.target.value })}>{SPOKEN_LANGUAGES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <span className="field-label">Caption language</span>
        <select aria-label="Caption language" value={f.captionLanguage} onChange={(e) => set({ captionLanguage: e.target.value })}>
          <option value="same">Same as spoken</option>
          {SPOKEN_LANGUAGES.filter((o) => o.value !== "auto").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="field"><span className="field-label">Extras</span>
        <div className="extras-grid">
          <label className="lib-check"><input type="checkbox" checked={f.removeSilences} onChange={(e) => set({ removeSilences: e.target.checked })} />Remove silences</label>
          <label className="lib-check"><input type="checkbox" checked={f.removeFillers} onChange={(e) => set({ removeFillers: e.target.checked })} />Remove fillers</label>
          <label className="lib-check"><input type="checkbox" checked={f.autoTransitions} onChange={(e) => set({ autoTransitions: e.target.checked })} />Auto transitions</label>
          <label className="lib-check"><input type="checkbox" checked={f.soundEffects} onChange={(e) => set({ soundEffects: e.target.checked })} />Sound effects</label>
          <label className="lib-check"><input type="checkbox" checked={f.keywordHighlight} onChange={(e) => set({ keywordHighlight: e.target.checked })} />Keyword highlight</label>
          <label className="lib-check"><input type="checkbox" checked={f.emojis} onChange={(e) => set({ emojis: e.target.checked })} />Emojis</label>
          <label className="lib-check">Zoom punch-ins
            <select aria-label="Zoom punch-ins" value={f.zoom} onChange={(e) => set({ zoom: e.target.value as FormState["zoom"] })}>{ZOOM_LEVELS.map((z) => <option key={z}>{z}</option>)}</select>
          </label>
          <label className="lib-check">Colour grade
            <select aria-label="Colour grade" value={f.grade} onChange={(e) => set({ grade: e.target.value as FormState["grade"] })}>{GRADE_PRESETS.map((g) => <option key={g} value={g}>{g === "none" ? "None" : g.charAt(0).toUpperCase() + g.slice(1)}</option>)}</select>
          </label>
          <label className="lib-check"><input type="checkbox" checked={f.autoBroll} onChange={(e) => set({ autoBroll: e.target.checked })} />Auto B-roll</label>
          <label className="lib-check">Music
            <select aria-label="Music" value={f.musicAssetId} onChange={(e) => set({ musicAssetId: e.target.value })}>
              <option value="">None</option>
              {music.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        </div>
        {f.autoBroll && <span className="caption muted">Auto B-roll needs B-roll in the Library B-roll tab or a stock key (later step of the build).</span>}
      </div>
    </div>

    <div className="clip-form-footer">
      <p className="caption muted" role="status">Queue: {queue.pending} job{queue.pending === 1 ? "" : "s"} ahead, about {queue.waitMinutes} minute{queue.waitMinutes === 1 ? "" : "s"}</p>
      <div className="clip-form-actions">
        <Button variant="ghost" onClick={saveDefaults}>Save as my defaults</Button>
        <Button disabled={busy || !!formProblem} onClick={start}><Sparkles />Start clipping</Button>
      </div>
    </div>
  </section>;
}

function JobCard({ job, refresh }: { job: Job; refresh: () => Promise<void> }) {
  const confirm = useServerFn(confirmClipCount);
  const [changing, setChanging] = useState(false);
  const [count, setCount] = useState(job.suggested_count ?? 4);
  const pill = statusPill(job.status);
  const created = new Date(job.created_at).toLocaleString();
  const elapsed = job.processing_seconds ?? Math.round((Date.now() - new Date(job.created_at).getTime()) / 1000);
  const thumb = job.source_assets?.thumbnail_url;

  async function accept(n: number) {
    try { await confirm({ data: { jobId: job.id, count: n } }); toast.success(`Continuing with ${n} clips`); await refresh(); }
    catch (e) { err(e); }
  }

  return <article className="glass-panel clip-job" aria-label={`Clip job for ${job.source_assets?.name ?? "source"}`}>
    {thumb ? <img className="clip-job-thumb" src={thumb} alt="" /> : <div className="clip-job-thumb"><Film /></div>}
    <div className="clip-job-body">
      <div className="lib-card-head">
        <h3>{job.source_assets?.name ?? "Source"}</h3>
        <span className={`status-pill tone-${pill.tone}`}>{pill.label}{job.status === "PROCESSING" && job.stage ? ` · ${STAGE_LABELS[job.stage] ?? job.stage} ${job.progress ?? 0}%` : ""}</span>
      </div>
      <p className="caption muted">{jobSummary({ coverage: job.coverage, clip_length: job.clip_length as never, edit_level: job.edit_level, formats: job.formats, aspect: job.aspect })} · started {created} · {elapsed < 60 ? `${elapsed}s` : `${Math.round(elapsed / 60)} min`}</p>
      {job.status === "PROCESSING" && <div className="lib-bar" aria-label="Progress"><i style={{ width: `${job.progress ?? 0}%` }} /></div>}
      {job.status === "AWAITING_CONFIRMATION" && <div className="clip-job-cta">
        <span>AI suggests <strong>{job.suggested_count ?? "?"}</strong> clips — accept, or change the number.</span>
        <div className="clip-job-actions">
          <Button size="sm" onClick={() => accept(job.suggested_count ?? 4)}><Check />Accept</Button>
          {changing
            ? <span className="range-inputs"><input aria-label="New clip count" type="number" min={CLIP_COUNT_MIN} max={CLIP_COUNT_MAX} value={count} onChange={(e) => setCount(Math.max(CLIP_COUNT_MIN, Math.min(CLIP_COUNT_MAX, Number(e.target.value) || CLIP_COUNT_MIN)))} /><Button size="sm" variant="outline" onClick={() => accept(count)}>Continue with {count}</Button></span>
            : <Button size="sm" variant="outline" onClick={() => { setCount(job.suggested_count ?? 4); setChanging(true); }}><Pencil />Change</Button>}
        </div>
      </div>}
      {job.status === "COMPLETED" && <Link className="btn-chip" to="/review"><ChevronRight />Review clips</Link>}
      {job.status === "FAILED" && <p className="caption text-destructive">{job.error ?? "The clip job failed."}</p>}
    </div>
  </article>;
}
