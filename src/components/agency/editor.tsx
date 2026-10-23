import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, AtSign, Captions, Check, Download, Eye, EyeOff, Loader2, Save, Send, SlidersHorizontal, Type, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { editorData, saveFinish, transcribeChunk } from "@/lib/finish.functions";
import { startExport } from "@/lib/review.functions";
import { CAPTION_PRESETS, TITLE_STYLES, TITLE_STYLE_NAMES, HIGHLIGHTS, WATERMARK_POS, ASPECTS, styleFor, wordsFromChunks, cuesFromWords, wordsFromCues, cueAt, type CaptionStyle, type Cue, type Overlays, type TitleStyle, type WatermarkPos } from "@/lib/finish-rules";
import { Distribute } from "./posts";

const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");
const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
/**
 * Cue times are clip time: 0 is the clip's first frame.
 *
 * Two producers disagreed. The Engine re-bases its words to zero; the browser
 * re-transcriber reported source time, because it cuts audio out of the full
 * video. Rows of both kinds are in the database, and the editor compares cue
 * times against the player's clock — so the wrong base means no caption ever
 * appears, which is invisible on a clip starting at 0:00 and total on every
 * other one. Anything that arrives in source time is converted once, here.
 */
export function toClipTime(cues: Cue[], startMs: number): Cue[] {
  if (!cues.length || startMs <= 0 || cues[0]!.start_ms < startMs) return cues;
  return cues.map((c) => ({ ...c, start_ms: c.start_ms - startMs, end_ms: c.end_ms - startMs }));
}

const ratio = (a: string) => { const [w, h] = a.split(":").map(Number); return `${w} / ${h}`; };
let fontLoaded = false;
async function loadPreviewFont() {
  if (fontLoaded || typeof document === "undefined") return;
  const { captionFont } = await import("@/lib/media-render");
  const f = new FontFace("Montserrat", (await captionFont()).slice().buffer, { weight: "800" });
  await f.load(); document.fonts.add(f); fontLoaded = true;
}


export function Editor({ clipId }: { clipId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["editor", clipId], queryFn: () => editorData({ data: { id: clipId } }) });
  const c = q.data?.clip;
  const [presetId, setPresetId] = useState("bold_white");
  const [custom, setCustom] = useState<Partial<CaptionStyle>>({});
  const [cues, setCues] = useState<Cue[]>([]);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [title, setTitle] = useState(""); const [titleStyle, setTitleStyle] = useState<TitleStyle>("bold_band");
  const [ov, setOv] = useState<Overlays>({});
  const [mark, setMark] = useState(""); const [aspect, setAspect] = useState("9:16");
  const [busy, setBusy] = useState(""); const [applyTo, setApplyTo] = useState<string[]>([]); const [posting, setPosting] = useState(false);
  const [now, setNow] = useState(0);
  const loaded = useRef(false);
  const seek = useRef<((ms: number) => void) | null>(null);
  useEffect(() => { void loadPreviewFont().catch(() => {}); }, []);
  useEffect(() => {
    if (!c || loaded.current) return; loaded.current = true;
    setPresetId(c.caption_style_id || q.data?.brand?.caption_style_id || "bold_white");
    setCustom(((c.caption_style ?? q.data?.brand?.caption_style) as Partial<CaptionStyle> | null) ?? {});
    setCues(toClipTime(Array.isArray(c.captions) ? (c.captions as Cue[]) : [], c.start_ms ?? 0));
    setCaptionsOn((c.caption_options as { enabled?: boolean } | null)?.enabled !== false);
    setTitle(c.title_text ?? c.title ?? ""); setTitleStyle((TITLE_STYLES as readonly string[]).includes(c.title_style ?? "") ? (c.title_style as TitleStyle) : "bold_band");
    setOv((c.overlays as Overlays | null) ?? {}); setMark(c.watermark_text ?? q.data?.brand?.handle ?? ""); setAspect(c.aspect ?? "9:16");
  }, [c, q.data]);
  const style = useMemo(() => styleFor(presetId, custom), [presetId, custom]);
  /**
   * Picking a style re-flows the words to that style's line length. Without
   * this, choosing "Word pop" leaves the four-word lines of the style before
   * it and the preview looks nothing like the button that was pressed.
   */
  function pickPreset(id: string) {
    const keep = {
      ...(custom.x != null ? { x: custom.x } : {}),
      ...(custom.y != null ? { y: custom.y } : {}),
    };
    setPresetId(id);
    setCustom(keep);
    const next = styleFor(id, keep).maxWords;
    if (cues.length && next !== style.maxWords)
      setCues((c) => cuesFromWords(wordsFromCues(c), next));
  }
  if (q.isLoading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (!c) return <div className="page"><p>Clip not found.</p></div>;
  const start = c.start_ms ?? 0, end = c.end_ms ?? 0;
  const src = q.data!.source?.playUrl ?? null;
  const patch = () => ({ caption_style_id: presetId, caption_style: custom, captions: cues, caption_options: { enabled: captionsOn }, title_text: title, title_style: titleStyle, overlays: ov, watermark_text: mark, aspect: aspect as (typeof ASPECTS)[number] });

  async function save(ids = [clipId], saveAsBrand = false) {
    try { const n = await saveFinish({ data: { ids, patch: patch(), saveAsBrand } }); await qc.invalidateQueries({ queryKey: ["review"] }); await qc.invalidateQueries({ queryKey: ["editor", clipId] }); toast.success(ids.length > 1 ? `Applied to ${n} clips` : "Saved"); } catch (e) { err(e); }
  }
  async function transcribe() {
    if (!src) { toast.error("The source video isn't stored in the app."); return; }
    try {
      const { audioChunks } = await import("@/lib/media-render");
      setBusy("Loading video tools…");
      const chunks = await audioChunks(src, start, end, 4000, setBusy);
      const out: Cue[] = new Array(chunks.length);
      let done = 0;
      const run = async (i: number) => { const ch = chunks[i]!; out[i] = { start_ms: ch.start_ms, end_ms: ch.end_ms, text: await transcribeChunk({ data: { audio: b64(ch.data), mime: "audio/mpeg" } }) }; setBusy(`Transcribing ${++done}/${chunks.length}`); };
      for (let i = 0; i < chunks.length; i += 3) await Promise.all([i, i + 1, i + 2].filter((x) => x < chunks.length).map(run));
      // audioChunks reports source time; everything downstream is clip time.
      const rebased = out.filter((x) => x.text).map((x) => ({ ...x, start_ms: x.start_ms - start, end_ms: x.end_ms - start }));
      const next = cuesFromWords(wordsFromChunks(rebased), style.maxWords);
      if (!next.length) toast.error("No speech was found in this clip."); else { setCues(next); toast.success(`${next.length} caption lines ready — edit any word below`); }
    } catch (e) { err(e); } finally { setBusy(""); }
  }
  async function exportNow() {
    try {
      // Save first so the Engine renders what is on screen, then hand it over.
      await saveFinish({ data: { ids: [clipId], patch: patch() } });
      const r = await startExport({ data: { ids: [clipId], resolution: "HD" } });
      if (r.engineFailed.length) { toast.error(r.engineFailed[0]!.error); return; }
      if (!r.engineQueued) {
        // An older clip with no Engine project behind it still renders in the
        // browser, and Review is where that path lives.
        toast.error(r.jobs.length
          ? "This clip is not on the Engine yet — export it from Review."
          : "Approve the clip in Review before exporting.");
        return;
      }
      toast.success("Rendering on the Engine — you can close this tab.");
      await qc.invalidateQueries({ queryKey: ["editor", clipId] }); await qc.invalidateQueries({ queryKey: ["review"] });
    } catch (e) { err(e); } finally { setBusy(""); }
  }
  const setS = (k: keyof CaptionStyle, v: unknown) => setCustom((x) => ({ ...x, [k]: v }));
  const words = wordsFromCues(cues);
  const canExport = ["APPROVED", "READY"].includes(c.status);
  const exported = c.status === "READY" && !!c.video_url;
  const step = exported ? 3 : canExport ? 2 : 1;
  const posName = ([["Top", 18], ["Middle", 50], ["Lower", 72], ["Bottom", 86]] as const).find(([, y]) => Math.abs(style.y - y) < 4)?.[0];
  const applyShared = async () => { const p = patch(); const { captions: _c, title_text: _t, ...shared } = p; try { await saveFinish({ data: { ids: applyTo, patch: shared } }); await saveFinish({ data: { ids: [clipId], patch: p } }); toast.success(`Applied to ${applyTo.length} clips`); setApplyTo([]); await qc.invalidateQueries({ queryKey: ["review"] }); } catch (e) { err(e); } };

  return <div className="page ed-page">
    <header className="ed-bar glass-panel">
      <div className="ed-bar-title">
        <Link to="/review" search={{ job: undefined }} className="ed-back" aria-label="Back to Review"><ArrowLeft size={16} /></Link>
        <div className="min-w-0"><h1 className="ed-h1">{c.title ?? "Clip"}</h1>
          <p className="caption">{Math.round((end - start) / 1000)}s · {c.status.toLowerCase()}{busy && <span className="status-pill tone-orange ed-busy"><Loader2 size={12} className="animate-spin" />{busy}</span>}</p></div>
      </div>
      <ol className="ed-steps" aria-label="Progress">
        {["Edit", "Export", "Post"].map((s, i) => <li key={s} className={i + 1 < step ? "done" : i + 1 === step ? "now" : ""}><span>{i + 1 < step ? <Check size={11} /> : i + 1}</span>{s}</li>)}
      </ol>
      <div className="ed-bar-actions">
        <Button variant="ghost" size="sm" onClick={() => save([clipId], true)} title="Use these settings on future clips">Save as defaults</Button>
        <Button variant="outline" size="sm" onClick={() => save()}><Save />Save</Button>
        <Button size="sm" onClick={exportNow} disabled={!!busy || !canExport} title={canExport ? "Render this clip" : "Approve the clip in Review first"}><Download />Export</Button>
        <Button variant={exported ? "default" : "outline"} size="sm" onClick={() => setPosting(true)} disabled={!exported} title={exported ? "" : "Export first"}><Send />Post</Button>
      </div>
    </header>

    <div className="ed-layout">
      <div className="ed-stage-col">
        <div className="ed-dock glass-panel" role="toolbar" aria-label="Picture controls">
          <div className="ed-dock-group"><span className="ed-dock-label">Format</span>
            <div className="ed-seg">{ASPECTS.map((a) => <button key={a} aria-pressed={aspect === a} onClick={() => setAspect(a)}><i className="ed-ratio" style={{ aspectRatio: ratio(a) }} />{a}</button>)}</div></div>
          <div className="ed-dock-group"><span className="ed-dock-label">Captions</span>
            <div className="ed-seg">
              <button aria-pressed={captionsOn} onClick={() => setCaptionsOn(!captionsOn)}>{captionsOn ? <Eye size={13} /> : <EyeOff size={13} />}{captionsOn ? "On" : "Off"}</button>
              {[["Top", 18], ["Middle", 50], ["Lower", 72], ["Bottom", 86]].map(([n, y]) => <button key={n} aria-pressed={posName === n} disabled={!captionsOn} onClick={() => setCustom((x) => ({ ...x, x: 50, y: y as number }))}>{n}</button>)}
            </div></div>
          <div className="ed-dock-group"><span className="ed-dock-label">Overlays</span>
            <div className="ed-seg">
              <button aria-pressed={!!title.trim()} onClick={() => setTitle(title.trim() ? "" : (c.title ?? "Title"))}><Type size={13} />Title</button>
              <button aria-pressed={!!mark.trim()} onClick={() => setMark(mark.trim() ? "" : (q.data?.brand?.handle ?? "@handle"))}><AtSign size={13} />Handle</button>
            </div></div>
        </div>

        <Preview ctl={seek} src={src} videoUrl={c.video_url} start={start} end={end} aspect={aspect} style={style} cues={captionsOn ? cues : []} title={title} titleStyle={titleStyle} ov={ov} mark={mark} onTime={setNow} onMove={(x, y) => setCustom((s) => ({ ...s, x, y }))} />

        <section className="glass-panel ed-script">
          <div className="ed-sec-head"><div><h2>Caption text</h2><p className="caption">{cues.length ? `${cues.length} lines · ${words.length} words — click a time to jump there, type to fix a word.` : "No captions yet."}</p></div>
            <Button size="sm" variant={cues.length ? "outline" : "default"} onClick={transcribe} disabled={!!busy}><Captions />{cues.length ? "Re-transcribe" : "Transcribe"}</Button></div>
          {cues.length > 0 && <div className="ed-cues">{cues.map((q2, i) => { const on = now >= q2.start_ms && now < q2.end_ms; return <div key={i} className={`ed-cue ${on ? "on" : ""}`}>
            <button className="ed-cue-time" onClick={() => seek.current?.(q2.start_ms)}>{(q2.start_ms / 1000).toFixed(1)}s</button>
            <input value={q2.text} aria-label={`Caption line ${i + 1}`} onChange={(e) => setCues((x) => x.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))} /></div>; })}</div>}
        </section>
      </div>

      <aside className="ed-rail">
        <section className="glass-panel ed-sec">
          <div className="ed-sec-head"><h2>Caption style</h2></div>
          <div className="ed-presets">{CAPTION_PRESETS.map((p) => { const s = styleFor(p.id); return <button key={p.id} aria-pressed={presetId === p.id} className="ed-preset" onClick={() => pickPreset(p.id)}>
            <span className="ed-preset-swatch"><span style={{ color: s.fill, WebkitTextStroke: s.box ? undefined : `${Math.min(2, s.outlineW / 3)}px ${s.outline}`, paintOrder: "stroke fill", background: s.box ? s.boxColor : undefined, padding: s.box ? "0 4px" : undefined, borderRadius: 3, textTransform: s.uppercase ? "uppercase" : undefined }}>Aa{s.active && <em style={{ color: s.active }}> word</em>}</span></span>
            <small>{p.name}</small></button>; })}</div>
          <details className="ed-more"><summary><SlidersHorizontal size={14} />Fine-tune</summary><div className="ed-fields">
            <label>Size<input type="range" min={28} max={120} value={style.size} onChange={(e) => setS("size", +e.target.value)} /></label>
            <div className="ed-row"><label>Fill<input type="color" value={style.fill} onChange={(e) => setS("fill", e.target.value)} /></label>
              <label>Outline<input type="color" value={style.outline} onChange={(e) => setS("outline", e.target.value)} /></label>
              <label>Active word<input type="color" value={style.active ?? "#30D158"} onChange={(e) => { setS("active", e.target.value); setS("animation", "karaoke"); }} /></label></div>
            <label>Outline width<input type="range" min={0} max={10} value={style.outlineW} onChange={(e) => setS("outlineW", +e.target.value)} /></label>
            <label className="ed-check"><input type="checkbox" checked={style.box} onChange={(e) => setS("box", e.target.checked)} />Background box</label>
            {style.box && <div className="ed-row"><label>Box colour<input type="color" value={style.boxColor} onChange={(e) => setS("boxColor", e.target.value)} /></label>
              <label>Box opacity<input type="range" min={0.1} max={1} step={0.05} value={style.boxOpacity} onChange={(e) => setS("boxOpacity", +e.target.value)} /></label></div>}
            <label className="ed-check"><input type="checkbox" checked={style.uppercase} onChange={(e) => setS("uppercase", e.target.checked)} />UPPERCASE</label>
            <div className="ed-row"><label>Animation<select value={style.animation} onChange={(e) => setS("animation", e.target.value)}>{["none", "pop", "karaoke", "bounce", "typewriter"].map((a) => <option key={a}>{a}</option>)}</select></label>
              <label>Words per line<input type="number" min={1} max={12} value={style.maxWords} onChange={(e) => setS("maxWords", +e.target.value)} /></label></div>
            <Button size="sm" variant="outline" onClick={() => setCues(cuesFromWords(wordsFromCues(cues), style.maxWords))} disabled={!cues.length}>Regroup lines</Button>
          </div></details>
        </section>

        <section className="glass-panel ed-sec">
          <div className="ed-sec-head"><h2>Title</h2>{title.trim() && <Button size="sm" variant="ghost" onClick={() => setTitle("")}>Remove</Button>}</div>
          <div className="ed-fields">
            <input value={title} maxLength={140} placeholder="Add a title on the video" aria-label="Title text" onChange={(e) => setTitle(e.target.value)} />
            <div className="ed-chips">{TITLE_STYLES.map((t) => <button key={t} aria-pressed={titleStyle === t} onClick={() => setTitleStyle(t)}>{TITLE_STYLE_NAMES[t]}</button>)}</div>
            {titleStyle === "headline" && <div className="ed-row"><label>Highlighted word<input value={ov.title?.highlight_word ?? ""} onChange={(e) => setOv((o) => ({ ...o, title: { y: o.title?.y ?? 14, ...o.title, highlight_word: e.target.value } }))} /></label>
              <label>Colour<select value={ov.title?.highlight ?? "yellow"} onChange={(e) => setOv((o) => ({ ...o, title: { y: o.title?.y ?? 14, ...o.title, highlight: e.target.value as keyof typeof HIGHLIGHTS } }))}>{Object.keys(HIGHLIGHTS).map((k) => <option key={k}>{k}</option>)}</select></label></div>}
            <label>Height from top · {ov.title?.y ?? 14}%<input type="range" min={4} max={60} value={ov.title?.y ?? 14} onChange={(e) => setOv((o) => ({ ...o, title: { ...o.title, y: +e.target.value } }))} /></label>
          </div>
        </section>

        <section className="glass-panel ed-sec">
          <div className="ed-sec-head"><h2>Handle watermark</h2></div>
          <div className="ed-fields">
            <input value={mark} placeholder="@yourhandle" maxLength={60} aria-label="Handle" onChange={(e) => setMark(e.target.value)} />
            <div className="ed-row"><label>Position<select value={ov.watermark?.pos ?? "centre-below-captions"} onChange={(e) => setOv((o) => ({ ...o, watermark: { opacity: o.watermark?.opacity ?? 0.5, pos: e.target.value as WatermarkPos } }))}>{WATERMARK_POS.map((p) => <option key={p}>{p}</option>)}</select></label>
              <label>Opacity<select value={ov.watermark?.opacity ?? 0.5} onChange={(e) => setOv((o) => ({ ...o, watermark: { pos: o.watermark?.pos ?? "centre-below-captions", opacity: +e.target.value } }))}>{[0.3, 0.5, 0.8].map((v) => <option key={v} value={v}>{v * 100}%</option>)}</select></label></div>
          </div>
        </section>

        {q.data!.others.length > 0 && <details className="glass-panel ed-sec ed-more">
          <summary><Wand2 size={14} />Use this look on other clips</summary>
          <p className="caption">Copies style, position, title style, handle and format. Each clip keeps its own words.</p>
          <div className="ed-apply">{q.data!.others.map((o) => <label key={o.id} className="ed-check"><input type="checkbox" checked={applyTo.includes(o.id)} onChange={(e) => setApplyTo((x) => (e.target.checked ? [...x, o.id] : x.filter((y) => y !== o.id)))} /><span className="min-w-0 truncate">{o.title ?? "Clip"}</span><small className="muted">{o.status.toLowerCase()}</small></label>)}</div>
          <Button size="sm" disabled={!applyTo.length} onClick={applyShared}><Wand2 />Apply to {applyTo.length || ""} selected</Button>
        </details>}
      </aside>
    </div>
    {posting && c.video_url && <Distribute clip={{ id: c.id, title: c.title, duration_ms: c.duration_ms, aspect: c.aspect, watermark_text: mark }} onClose={() => setPosting(false)} />}
  </div>;
}

function Preview({ ctl, src, videoUrl, start, end, aspect, style, cues, title, titleStyle, ov, mark, onTime, onMove }: { ctl: React.MutableRefObject<((ms: number) => void) | null>; src: string | null; videoUrl: string | null; start: number; end: number; aspect: string; style: CaptionStyle; cues: Cue[]; title: string; titleStyle: TitleStyle; ov: Overlays; mark: string; onTime: (ms: number) => void; onMove: (x: number, y: number) => void }) {
  const box = useRef<HTMLDivElement>(null); const [w, setW] = useState(360); const [t, setT] = useState(start); const drag = useRef(false); const vid = useRef<HTMLVideoElement>(null);
  // Cue times are in source time. Translate to whatever is actually playing:
  // the exported clip starts at zero, the full source does not. Keying this
  // off "is there a source" instead of "what is on screen" sent every cue
  // click to 42 minutes into a 3 minute file.
  useEffect(() => {
    ctl.current = (ms) => {
      const v = vid.current;
      if (!v) return;
      // ms is clip time. The exported clip starts at zero; the full source
      // starts wherever this clip begins.
      v.currentTime = (videoUrl ? ms : ms + start) / 1000;
      void v.play().catch(() => {});
    };
  }, [ctl, videoUrl, start]);
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); return () => ro.disconnect(); }, []);
  const k = w / 1080;
  const cue = cueAt(cues, t);
  const text = cue ? (style.uppercase ? cue.text.toUpperCase() : cue.text) : "";
  const ws = text.split(/\s+/).filter(Boolean);
  const activeIdx = cue ? Math.min(ws.length - 1, Math.floor(((t - cue.start_ms) / Math.max(1, cue.end_ms - cue.start_ms)) * ws.length)) : -1;
  const shown = style.animation === "typewriter" ? ws.slice(0, activeIdx + 1) : ws;
  const move = (e: React.PointerEvent) => { if (!drag.current || !box.current) return; const r = box.current.getBoundingClientRect(); onMove(Math.max(5, Math.min(95, ((e.clientX - r.left) / r.width) * 100)), Math.max(5, Math.min(95, ((e.clientY - r.top) / r.height) * 100))); };
  // Prefer the exported clip. It is this clip and nothing else: a few MB
  // instead of a 1.5GB source, a scrubber that reads 3:37 instead of 46:32,
  // and seeking that lands instantly. The source, played through a media
  // fragment, was making the editor stream the whole video to show a sliver
  // of it. Falling back to the source still covers a clip never exported.
  const clipOnly = !!videoUrl;
  const url = videoUrl ?? (src ? `${src}#t=${start / 1000},${end / 1000}` : null);
  const hw = (ov.title?.highlight_word ?? "").toLowerCase();
  const pos = ov.watermark?.pos ?? "centre-below-captions";
  return <section className="ed-stage">
    <div ref={box} className="editor-frame ed-frame" style={{ aspectRatio: ratio(aspect), width: `min(100%, calc(60vh * ${aspect.split(":").map(Number).reduce((w, h) => w / h)}))` }} onPointerMove={move} onPointerUp={() => (drag.current = false)} onPointerLeave={() => (drag.current = false)}>
      {url ? <video ref={vid} src={url} controls playsInline onTimeUpdate={(e) => { const ms = clipOnly ? e.currentTarget.currentTime * 1000 : e.currentTarget.currentTime * 1000 - start; setT(ms); onTime(ms); if (!clipOnly && ms >= end - start) { e.currentTarget.pause(); } }} /> : <p className="muted">No video available.</p>}
      {title.trim() && <div className={`ed-title ed-${titleStyle}`} style={{ top: `${ov.title?.y ?? 14}%`, fontSize: 66 * k }}>{title.split(/\s+/).map((x, i) => <span key={i} style={titleStyle === "headline" && hw && x.toLowerCase().replace(/[^\w']/g, "") === hw.replace(/[^\w']/g, "") ? { color: HIGHLIGHTS[ov.title?.highlight ?? "yellow"] } : undefined}>{x} </span>)}</div>}
      {text && <div className="ed-caption" onPointerDown={(e) => { drag.current = true; e.preventDefault(); }} style={{ left: `${style.x}%`, top: `${style.y}%`, fontSize: style.size * k, color: style.fill, WebkitTextStroke: style.box ? undefined : `${style.outlineW * k}px ${style.outline}`, paintOrder: "stroke fill", textShadow: style.shadow && !style.box ? `0 ${3 * k}px ${4 * k}px rgba(0,0,0,.5)` : undefined, background: style.box ? `color-mix(in srgb, ${style.boxColor} ${style.boxOpacity * 100}%, transparent)` : undefined }}>
        {shown.map((x, i) => <span key={i} style={style.active && style.animation === "karaoke" && i === activeIdx ? { color: style.active } : undefined}>{x} </span>)}</div>}
      {mark.trim() && <div className={`ed-mark ed-${pos}`} style={{ fontSize: 34 * k, opacity: ov.watermark?.opacity ?? 0.5, ...(pos === "centre-below-captions" ? { top: `calc(${style.y}% + ${style.size * k * 1.4}px)` } : {}) }}>{mark}</div>}
    </div>
    <p className="caption ed-hint">{cues.length ? "Drag the caption on the video to place it anywhere." : "Transcribe to see captions on the video."}</p>
  </section>;
}
