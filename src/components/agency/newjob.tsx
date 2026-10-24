import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Link2, Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { analyzeLink, type LinkDetails } from "@/lib/analyze.functions";
import { engineImport, importedSourceStatus } from "@/lib/library.functions";
import { waitForImportedSource } from "@/lib/import-wait";
import { clipJobStatus, createClipJob } from "@/lib/clip.functions";
import { ASPECT_OPTIONS, GENRES, LENGTH_BANDS, bandByValue } from "@/lib/clip-rules";

/** The clip models, in the creator's words rather than the engine's. */
const MODELS = [
  { value: "AUTO", label: "Auto", hint: "Let the AI pick the right approach" },
  { value: "VISUAL", label: "Clip anything", hint: "Works on any video, speech or not" },
  { value: "SPEECH", label: "Clip talking", hint: "Best for interviews and podcasts" },
] as const;

/** These ids must exist in the Engine's style catalogue (GET /v1/subtitle-styles). */
const CAPTION_PRESETS = [
  { id: "none", name: "No caption" },
  { id: "karaoke_highlight", name: "Karaoke" },
  { id: "bold_white", name: "Bold" },
  { id: "highlighter", name: "Highlight" },
  { id: "yellow_pop", name: "Pop" },
  { id: "word_pop", name: "Word pop" },
  { id: "uppercase_impact", name: "Impact" },
  { id: "minimal", name: "Minimal" },
] as const;

/**
 * What the Engine is doing, in order, for the card shown while it works.
 * `stages` are the values the Engine reports on the job.
 */
const STEPS = [
  { label: "Fetching and preparing the video", stages: ["IMPORTING"] },
  { label: "Listening to it", stages: ["TRANSCRIBING"] },
  { label: "Finding the moments", stages: ["FINDING", "FRAMING"] },
  { label: "Cutting and captioning", stages: ["BUILDING"] },
] as const;

/** Which step is in progress, from the phase and the Engine's own stage. */
function stepIndex(phase: Phase, stage: string | null): number {
  if (phase === "importing") return 0;
  if (phase === "done") return STEPS.length;
  const i = STEPS.findIndex((s) => (s.stages as readonly string[]).includes(stage ?? ""));
  return i === -1 ? 1 : i;
}

const clock = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

type Phase = "setup" | "importing" | "clipping" | "done" | "failed";

type Options = {
  model: string;
  genre: string;
  band: string;
  autoHeadline: boolean;
  prompt: string;
  titleBrief: string;
  startMs: number;
  endMs: number;
  caption: string;
  aspect: string;
  coverage: "BEST_MOMENTS" | "DONT_CLIP";
  rights: boolean;
};

const defaults = (d: LinkDetails): Options => ({
  model: "AUTO",
  genre: "Auto",
  band: LENGTH_BANDS.find((b) => b.label === d.suggested.clip_length)?.value ?? "auto",
  autoHeadline: true,
  prompt: "",
  titleBrief: "",
  startMs: 0,
  endMs: d.duration_ms,
  caption: "karaoke_highlight",
  aspect: "9:16",
  coverage: "BEST_MOMENTS",
  rights: false,
});

export function NewJob() {
  const importVideo = useServerFn(engineImport);
  const readImport = useServerFn(importedSourceStatus);
  const createJob = useServerFn(createClipJob);
  const analyze = useServerFn(analyzeLink);
  const readJob = useServerFn(clipJobStatus);
  const [phase, setPhase] = useState<Phase>("setup");
  const [jobId, setJobId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [failure, setFailure] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [url, setUrl] = useState("");
  const [details, setDetails] = useState<LinkDetails | null>(null);
  const [opts, setOpts] = useState<Options | null>(null);
  const set = <K extends keyof Options>(k: K, v: Options[K]) =>
    setOpts((o) => (o ? { ...o, [k]: v } : o));

  const look = useMutation({
    mutationFn: (u: string) => analyze({ data: { url: u } }),
    onSuccess: (d) => {
      setDetails(d);
      setOpts(defaults(d));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const start = useMutation({
    mutationFn: async () => {
      if (!details || !opts) throw new Error("Paste a link first.");
      const band = bandByValue(opts.band);
      const imported = await importVideo({
        data: { url: details.url, name: details.title, rightsConfirmed: opts.rights },
      });
      if (!imported.ready) {
        await waitForImportedSource(() => readImport({ data: { id: imported.id } }));
      }
      setPhase("clipping");
      return createJob({
        data: {
          sourceId: imported.id,
          rangeStartMs: opts.startMs > 0 ? opts.startMs : null,
          rangeEndMs: opts.endMs < details.duration_ms ? opts.endMs : null,
          coverage: opts.coverage,
          clipCount: "auto",
          autopilot: true,
          lengthPreset: opts.band === "auto" ? "auto" : "custom",
          lengthMinS: band.min_s || 45,
          lengthMaxS: band.max_s || 120,
          genre: opts.genre,
          mode: opts.model as "AUTO" | "SPEECH" | "ENERGY" | "VISUAL",
          prompt: opts.prompt,
          titleBrief: opts.titleBrief,
          mustInclude: [],
          headlineTopN: opts.autoHeadline ? 10 : 0,
          alternates: false,
          editLevel: "full",
          aspect: opts.aspect as "9:16" | "1:1" | "4:5" | "16:9",
          layouts: ["auto"],
          framing: "AUTO",
          language: details.language || "auto",
          captionLanguage: "same",
          captionStyleId: opts.caption === "none" ? "bold_white" : opts.caption,
          captionsEnabled: opts.caption !== "none",
          extras: {
            removeSilences: false,
            removeFillers: false,
            zoom: "Balanced",
            autoTransitions: false,
            soundEffects: false,
            grade: "none",
            keywordHighlight: opts.caption !== "none",
            emojis: false,
            autoBroll: false,
          },
          brollAssetId: null,
          musicAssetId: null,
        },
      });
    },
    // The card stays put and follows the job through, rather than throwing the
    // user onto another screen to wonder whether anything is happening.
    onSuccess: (job) => setJobId(job.id),
    onError: (e: Error) => {
      setFailure(e.message);
      setPhase("failed");
    },
  });

  const running = phase === "importing" || phase === "clipping";

  function begin() {
    setFailure("");
    setJobId(null);
    setStartedAt(Date.now());
    setElapsed(0);
    setPhase("importing");
    start.mutate();
  }

  function reset() {
    setFailure("");
    setPhase("setup");
    setJobId(null);
    setDetails(null);
    setOpts(null);
    setUrl("");
  }

  // The clock the user watches. One second is the only sensible tick for it.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running, startedAt]);

  const job = useQuery({
    queryKey: ["clip-job", jobId],
    queryFn: () => readJob({ data: { id: jobId! } }),
    enabled: !!jobId && phase === "clipping",
    refetchInterval: 4000,
  });

  const jobStatus = job.data?.status;
  const jobError = job.data?.error;
  useEffect(() => {
    if (jobStatus === "COMPLETED") setPhase("done");
    if (jobStatus === "FAILED") {
      setFailure(jobError || "The clip job failed.");
      setPhase("failed");
      setJobId(null);
    }
  }, [jobStatus, jobError]);

  const blocked = !!details?.needs_rights && !opts?.rights;

  return (
    <section className="section" aria-label="Start a clip job">
      <form
        className="url-bar glass"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) look.mutate(url.trim());
        }}
      >
        <Link2 size={18} aria-hidden className="url-bar-icon" />
        <input
          className="url-bar-input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a YouTube link, or any video URL"
          aria-label="Video link"
          inputMode="url"
        />
        <Button type="submit" disabled={!url.trim() || look.isPending || running}>
          {look.isPending ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
          {look.isPending ? "Reading" : "Get clips"}
        </Button>
      </form>
      <p className="caption url-bar-note">
        <Upload size={13} aria-hidden /> Or upload a file from the Library.
      </p>

      {details && phase !== "setup" && (
        <JobRun
          details={details}
          phase={phase}
          step={stepIndex(phase, job.data?.stage ?? null)}
          percent={phase === "done" ? 100 : phase === "clipping" ? job.data?.progress ?? null : null}
          clips={job.data?.clips ?? 0}
          elapsed={elapsed}
          jobId={jobId}
          failure={failure}
          onAgain={reset}
          onRetry={begin}
        />
      )}

      {details && opts && phase === "setup" && (
        <div className="job-setup glass-panel">
          <div className="job-preview">
            {details.thumbnail_url ? (
              <div className="job-thumb">
                <img src={details.thumbnail_url} alt="" />
                <span className="job-quality">{details.quality}</span>
              </div>
            ) : null}
            <div>
              <h3 className="job-title">{details.title || "Untitled video"}</h3>
              <p className="caption">
                {details.channel ? `${details.channel} · ` : ""}
                {mmss(details.duration_ms)}
                {details.subtitle_languages.length ? " · captions available" : ""}
              </p>
              {details.quality_warning && (
                <p className="caption warn">
                  This source is below 1080p, so the clips will be too.
                </p>
              )}
            </div>
          </div>

          <div className="job-tabs" role="tablist">
            {(["BEST_MOMENTS", "DONT_CLIP"] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={opts.coverage === c}
                className={opts.coverage === c ? "job-tab is-on" : "job-tab"}
                onClick={() => set("coverage", c)}
              >
                {c === "BEST_MOMENTS" ? "AI clipping" : "Don't clip"}
              </button>
            ))}
          </div>

          <div className="job-row">
            <label className="field">
              <span>Clip model</span>
              <select value={opts.model} onChange={(e) => set("model", e.target.value)}>
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Genre</span>
              <select value={opts.genre} onChange={(e) => set("genre", e.target.value)}>
                {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Clip length</span>
              <select
                value={opts.band}
                onChange={(e) => set("band", e.target.value)}
                disabled={opts.coverage === "DONT_CLIP"}
              >
                {LENGTH_BANDS.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Aspect</span>
              <select value={opts.aspect} onChange={(e) => set("aspect", e.target.value)}>
                {ASPECT_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          </div>

          <div className="job-row job-toggles">
            <label className="switch">
              <input
                type="checkbox"
                checked={opts.autoHeadline}
                onChange={(e) => set("autoHeadline", e.target.checked)}
              />
              <span>Auto headline</span>
            </label>
          </div>

          <label className="field">
            <span>Look for specific moments</span>
            <input
              value={opts.prompt}
              onChange={(e) => set("prompt", e.target.value)}
              placeholder="e.g. every time they disagree with each other"
            />
          </label>

          {/* The AI writes every headline from what its own clip says. This
              is the kind of line it should write, not the words. */}
          <label className="field">
            <span>How headlines should read</span>
            <input
              value={opts.titleBrief}
              onChange={(e) => set("titleBrief", e.target.value)}
              placeholder="e.g. phrase it as a question — respectful, no hype"
            />
            <small className="caption">Just for this video. Leave it blank to use your saved style.</small>
          </label>

          <fieldset className="job-range">
            <legend>Which part of the video</legend>
            <div className="job-range-row">
              <span className="pill">{mmss(opts.startMs)}</span>
              <input
                type="range"
                min={0}
                max={details.duration_ms}
                step={1000}
                value={opts.startMs}
                aria-label="Start"
                onChange={(e) => set("startMs", Math.min(Number(e.target.value), opts.endMs - 15000))}
              />
              <input
                type="range"
                min={0}
                max={details.duration_ms}
                step={1000}
                value={opts.endMs}
                aria-label="End"
                onChange={(e) => set("endMs", Math.max(Number(e.target.value), opts.startMs + 15000))}
              />
              <span className="pill">{mmss(opts.endMs)}</span>
            </div>
          </fieldset>

          <fieldset className="job-presets">
            <legend>Captions</legend>
            <div className="preset-grid">
              {CAPTION_PRESETS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={opts.caption === c.id ? "preset is-on" : "preset"}
                  aria-pressed={opts.caption === c.id}
                  onClick={() => set("caption", c.id)}
                >
                  <span className={`preset-sample sample-${c.id}`}>To get started</span>
                  <span className="preset-name">{c.name}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {details.needs_rights && (
            <label className="switch rights">
              <input
                type="checkbox"
                checked={opts.rights}
                onChange={(e) => set("rights", e.target.checked)}
              />
              <span>I own this footage, or I have the rights to clip it.</span>
            </label>
          )}

          <div className="job-actions">
            <Button variant="ghost" type="button" onClick={reset}>
              Cancel
            </Button>
            <Button type="button" disabled={blocked} onClick={begin}>
              <Sparkles size={16} />
              Get clips
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * What replaces the options once the work starts: the video you chose, the
 * step the Engine is on, and how long it has been going. The settings are
 * gone, because there is nothing left to set.
 */
function JobRun({
  details, phase, step, percent, clips, elapsed, jobId, failure, onAgain, onRetry,
}: {
  details: LinkDetails;
  phase: Phase;
  step: number;
  percent: number | null;
  clips: number;
  elapsed: number;
  jobId: string | null;
  failure: string;
  onAgain: () => void;
  onRetry: () => void;
}) {
  const done = phase === "done";
  const failed = phase === "failed";
  return (
    <div className="job-run glass-panel">
      <div className="job-preview">
        {details.thumbnail_url ? (
          <div className="job-thumb">
            <img src={details.thumbnail_url} alt="" />
            <span className="job-quality">{details.quality}</span>
          </div>
        ) : null}
        <div className="min-w-0">
          <h3 className="job-title">{details.title || "Untitled video"}</h3>
          <p className="caption">
            {details.channel ? `${details.channel} · ` : ""}
            {mmss(details.duration_ms)}
          </p>
          <p className={failed ? "job-run-state is-failed" : "job-run-state"}>
            {failed
              ? "Stopped"
              : done
                ? `${clips} clip${clips === 1 ? "" : "s"} ready`
                : STEPS[step]?.label ?? "Working"}
            <span className="caption muted"> · {clock(elapsed)}</span>
          </p>
        </div>
      </div>

      {failed ? (
        <p className="job-run-error">{failure}</p>
      ) : (
        <>
          <div className="job-bar" role="progressbar" aria-label="Progress">
            <i
              className={percent == null ? "is-waiting" : ""}
              style={percent == null ? undefined : { width: `${Math.max(4, percent)}%` }}
            />
          </div>

          <ol className="job-steps">
            {STEPS.map((s, i) => (
              <li key={s.label} className={i < step ? "is-done" : i === step ? "is-now" : ""}>
                <span className="job-step-dot">
                  {i < step ? <Check size={11} /> : i === step ? <Loader2 size={11} className="spin" /> : null}
                </span>
                {s.label}
              </li>
            ))}
          </ol>
        </>
      )}

      {failed ? (
        <div className="job-actions">
          <Button variant="ghost" type="button" onClick={onAgain}>
            Start over
          </Button>
          <Button type="button" onClick={onRetry}>
            <Sparkles size={16} />
            Try again
          </Button>
        </div>
      ) : done ? (
        <div className="job-actions">
          <Button variant="ghost" type="button" onClick={onAgain}>
            Clip another video
          </Button>
          <Button asChild>
            <Link to="/review" search={{ job: jobId ?? undefined }}>Open the clips</Link>
          </Button>
        </div>
      ) : (
        <p className="caption muted">
          You can leave this page. The Engine keeps working and the clips land in Review.
        </p>
      )}
    </div>
  );
}
