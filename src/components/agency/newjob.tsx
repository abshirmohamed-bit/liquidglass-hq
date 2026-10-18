import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Link2, Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { analyzeLink, type LinkDetails } from "@/lib/analyze.functions";
import { engineImport, sourceStatus } from "@/lib/library.functions";
import { createClipJob } from "@/lib/clip.functions";
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

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

type Options = {
  model: string;
  genre: string;
  band: string;
  autoHeadline: boolean;
  prompt: string;
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
  startMs: 0,
  endMs: d.duration_ms,
  caption: "karaoke_highlight",
  aspect: "9:16",
  coverage: "BEST_MOMENTS",
  rights: false,
});

export function NewJob() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [details, setDetails] = useState<LinkDetails | null>(null);
  const [opts, setOpts] = useState<Options | null>(null);
  const [stage, setStage] = useState("");
  const set = <K extends keyof Options>(k: K, v: Options[K]) =>
    setOpts((o) => (o ? { ...o, [k]: v } : o));

  const look = useMutation({
    mutationFn: (u: string) => analyzeLink({ data: { url: u } }),
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
      setStage("Fetching the video…");
      const imported = await engineImport({
        data: { url: details.url, name: details.title, rightsConfirmed: opts.rights },
      });

      // The Engine downloads in the background; a long video takes minutes.
      if (!imported.ready) {
        const deadline = Date.now() + 20 * 60_000;
        for (;;) {
          await new Promise((r) => setTimeout(r, 4000));
          const s = await sourceStatus({ data: { id: imported.id } });
          if (s.status === "READY") break;
          if (s.status === "FAILED") throw new Error(s.error ?? "That video could not be downloaded.");
          if (Date.now() > deadline) {
            throw new Error("Still downloading. It will appear in the Library when it finishes.");
          }
        }
      }

      setStage("Starting the clip job…");
      return createClipJob({
        data: {
          sourceId: imported.id,
          rangeStartMs: opts.startMs > 0 ? opts.startMs : null,
          rangeEndMs: opts.endMs < details.duration_ms ? opts.endMs : null,
          coverage: opts.coverage,
          clipCount: "auto",
          lengthPreset: opts.band === "auto" ? "auto" : "custom",
          lengthMinS: band.min_s || 45,
          lengthMaxS: band.max_s || 120,
          genre: opts.genre,
          mode: opts.model as "AUTO" | "SPEECH" | "ENERGY" | "VISUAL",
          prompt: opts.prompt,
          mustInclude: [],
          headlineTopN: opts.autoHeadline ? 10 : 0,
          alternates: false,
          editLevel: "full",
          aspect: opts.aspect as "9:16" | "1:1" | "4:5" | "16:9",
          layouts: ["streamer"],
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
    onSuccess: () => {
      setStage("");
      toast.success("Finding your clips. They'll appear in Review when they're ready.");
      setDetails(null);
      setOpts(null);
      setUrl("");
      navigate({ to: "/clips", search: { source: undefined } });
    },
    onError: (e: Error) => { setStage(""); toast.error(e.message); },
  });

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
        <Button type="submit" disabled={!url.trim() || look.isPending}>
          {look.isPending ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
          {look.isPending ? "Reading" : "Get clips"}
        </Button>
      </form>
      <p className="caption url-bar-note">
        <Upload size={13} aria-hidden /> Or upload a file from the Library.
      </p>

      {details && opts && (
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
            <Button variant="ghost" type="button" onClick={() => { setDetails(null); setOpts(null); }}>
              Cancel
            </Button>
            <Button type="button" disabled={blocked || start.isPending} onClick={() => start.mutate()}>
              {start.isPending ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
              {start.isPending ? (stage || "Working") : "Get clips"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
