import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Captions, Save, Send, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { editorData, saveFinish, transcribeChunk } from "@/lib/finish.functions";
import { startExport, finishExport } from "@/lib/review.functions";
import { CAPTION_PRESETS, TITLE_STYLES, TITLE_STYLE_NAMES, HIGHLIGHTS, WATERMARK_POS, ASPECTS, styleFor, wordsFromChunks, cuesFromWords, wordsFromCues, cueAt, finishSpec, type CaptionStyle, type Cue, type Overlays, type TitleStyle, type WatermarkPos } from "@/lib/finish-rules";
import { exportSize } from "@/lib/review-rules";
import { Distribute } from "./posts";

const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");
const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const ratio = (a: string) => { const [w, h] = a.split(":").map(Number); return `${w} / ${h}`; };
let fontLoaded = false;
async function loadPreviewFont() {
  if (fontLoaded || typeof document === "undefined") return;
  const { captionFont } = await import("@/lib/media-render");
  const f = new FontFace("Montserrat", (await captionFont()).slice().buffer, { weight: "800" });
  await f.load(); document.fonts.add(f); fontLoaded = true;
}

type Tab = "Subtitles" | "Title" | "Watermark" | "Layout";

export function Editor({ clipId }: { clipId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["editor", clipId], queryFn: () => editorData({ data: { id: clipId } }) });
  const c = q.data?.clip;
  const [tab, setTab] = useState<Tab>("Subtitles");
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
  useEffect(() => { void loadPreviewFont().catch(() => {}); }, []);
  useEffect(() => {
    if (!c || loaded.current) return; loaded.current = true;
    setPresetId(c.caption_style_id || q.data?.brand?.caption_style_id || "bold_white");
    setCustom(((c.caption_style ?? q.data?.brand?.caption_style) as Partial<CaptionStyle> | null) ?? {});
    setCues(Array.isArray(c.captions) ? (c.captions as Cue[]) : []);
    setCaptionsOn((c.caption_options as { enabled?: boolean } | null)?.enabled !== false);
    setTitle(c.title_text ?? c.title ?? ""); setTitleStyle((TITLE_STYLES as readonly string[]).includes(c.title_style ?? "") ? (c.title_style as TitleStyle) : "bold_band");
    setOv((c.overlays as Overlays | null) ?? {}); setMark(c.watermark_text ?? q.data?.brand?.handle ?? ""); setAspect(c.aspect ?? "9:16");
  }, [c, q.data]);
  const style = useMemo(() => styleFor(presetId, custom), [presetId, custom]);
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
      const chunks = await audioChunks(src, start, end, 4000, (x) => { console.info("[transcribe]", x); setBusy(x); });
      const out: Cue[] = new Array(chunks.length);
      let done = 0;
      const run = async (i: number) => { const ch = chunks[i]!; out[i] = { start_ms: ch.start_ms, end_ms: ch.end_ms, text: await transcribeChunk({ data: { audio: b64(ch.data), mime: "audio/mpeg" } }) }; console.info("[transcribe] chunk", i, ch.data.length, JSON.stringify(out[i]?.text).slice(0, 80)); setBusy(`Transcribing ${++done}/${chunks.length}`); };
      for (let i = 0; i < chunks.length; i += 3) await Promise.all([i, i + 1, i + 2].filter((x) => x < chunks.length).map(run));
      const next = cuesFromWords(wordsFromChunks(out.filter((x) => x.text)), style.maxWords);
      console.info("[transcribe] done", next.length);
      if (!next.length) toast.error("No speech was found in this clip."); else { setCues(next); toast.success(`${next.length} caption lines ready — edit any word below`); }
    } catch (e) { err(e); } finally { setBusy(""); }
  }
  async function exportNow() {
    try {
      await saveFinish({ data: { ids: [clipId], patch: patch() } });
      const res = "HD" as const;
      const r = await startExport({ data: { ids: [clipId], resolution: res } });
      const j = r.jobs[0]; if (!j) { toast.error("Approve the clip in Review before exporting."); return; }
      const size = exportSize(res, aspect);
      const fresh = { ...c!, ...patch(), captions: cues } as Parameters<typeof finishSpec>[0];
      const { renderClip } = await import("@/lib/media-render");
      try {
        const o = await renderClip(r.workspace, { ...j, aspect, w: size.w, h: size.h, finish: finishSpec(fresh, j.segments) }, setBusy);
        await finishExport({ data: { exportId: j.exportId, ...o } }); toast.success("Exported with captions");
      } catch (e) { await finishExport({ data: { exportId: j.exportId, path: null, thumbPath: null, width: null, height: null, size: null, lengthSec: null, error: e instanceof Error ? e.message : "Render failed" } }); throw e; }
      await qc.invalidateQueries({ queryKey: ["editor", clipId] }); await qc.invalidateQueries({ queryKey: ["review"] });
    } catch (e) { err(e); } finally { setBusy(""); }
  }
  const setS = (k: keyof CaptionStyle, v: unknown) => setCustom((x) => ({ ...x, [k]: v }));
  const words = wordsFromCues(cues);

  return <div className="page editor-page">
    <header className="page-header">
      <div><Link to="/review" search={{ job: undefined }} className="caption muted"><ArrowLeft size={14} /> Review</Link><h1>{c.title ?? "Clip"}</h1><p className="page-subtitle">{Math.round((end - start) / 1000)}s · {c.status.toLowerCase()} {busy && <span className="status-pill tone-orange">{busy}</span>}</p></div>
      <div className="review-actions">
        <Button variant="outline" onClick={() => save()}><Save />Save</Button>
        <Button variant="outline" onClick={() => save([clipId], true)}>Save as my defaults</Button>
        <Button onClick={exportNow} disabled={!!busy || !["APPROVED", "READY"].includes(c.status)} title={["APPROVED", "READY"].includes(c.status) ? "" : "Approve the clip in Review first"}>Export video</Button>
        <Button variant="outline" onClick={() => setPosting(true)} disabled={c.status !== "READY" || !c.video_url} title={c.status === "READY" ? "" : "Export first"}><Send />Post</Button>
      </div>
    </header>
    <div className="editor-grid">
      <section className="glass-panel editor-controls">
        <div className="editor-tabs" role="tablist">{(["Subtitles", "Title", "Watermark", "Layout"] as Tab[]).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={`status-pill ${tab === t ? "tone-blue" : ""}`} onClick={() => setTab(t)}>{t}</button>)}</div>
        {tab === "Subtitles" && <>
          <div className="review-actions"><Button size="sm" onClick={transcribe} disabled={!!busy}><Captions />{cues.length ? "Re-transcribe" : "Transcribe & add captions"}</Button>
            <label className="lib-check"><input type="checkbox" checked={captionsOn} onChange={(e) => setCaptionsOn(e.target.checked)} />Captions on</label></div>
          <h3>Style</h3>
          <div className="preset-grid">{CAPTION_PRESETS.map((p) => { const s = styleFor(p.id); return <button key={p.id} aria-pressed={presetId === p.id} className={`preset ${presetId === p.id ? "on" : ""}`} onClick={() => { setPresetId(p.id); setCustom((x) => ({ ...(x.x != null ? { x: x.x } : {}), ...(x.y != null ? { y: x.y } : {}) })); }}>
            <span style={{ color: s.fill, WebkitTextStroke: s.box ? undefined : `${Math.min(2, s.outlineW / 3)}px ${s.outline}`, background: s.box ? s.boxColor : undefined, textTransform: s.uppercase ? "uppercase" : undefined }}>Aa {s.active && <em style={{ color: s.active }}>word</em>}</span><small>{p.name}</small></button>; })}</div>
          <details><summary>Customise</summary><div className="editor-fields">
            <label>Size<input type="range" min={28} max={120} value={style.size} onChange={(e) => setS("size", +e.target.value)} /></label>
            <label>Fill<input type="color" value={style.fill} onChange={(e) => setS("fill", e.target.value)} /></label>
            <label>Outline<input type="color" value={style.outline} onChange={(e) => setS("outline", e.target.value)} /></label>
            <label>Outline width<input type="range" min={0} max={10} value={style.outlineW} onChange={(e) => setS("outlineW", +e.target.value)} /></label>
            <label className="lib-check"><input type="checkbox" checked={style.box} onChange={(e) => setS("box", e.target.checked)} />Background box</label>
            <label>Box colour<input type="color" value={style.boxColor} onChange={(e) => setS("boxColor", e.target.value)} /></label>
            <label>Box opacity<input type="range" min={0.1} max={1} step={0.05} value={style.boxOpacity} onChange={(e) => setS("boxOpacity", +e.target.value)} /></label>
            <label className="lib-check"><input type="checkbox" checked={style.uppercase} onChange={(e) => setS("uppercase", e.target.checked)} />UPPERCASE</label>
            <label>Active word<input type="color" value={style.active ?? "#30D158"} onChange={(e) => { setS("active", e.target.value); setS("animation", "karaoke"); }} /></label>
            <label>Animation<select value={style.animation} onChange={(e) => setS("animation", e.target.value)}>{["none", "pop", "karaoke", "bounce", "typewriter"].map((a) => <option key={a}>{a}</option>)}</select></label>
            <label>Max words per line<input type="number" min={1} max={12} value={style.maxWords} onChange={(e) => setS("maxWords", +e.target.value)} /></label>
            <Button size="sm" variant="ghost" onClick={() => setCues(cuesFromWords(wordsFromCues(cues), style.maxWords))} disabled={!cues.length}>Regroup lines</Button>
          </div></details>
          <p className="caption muted">Drag the caption on the preview to move it. Position: {Math.round(style.x)}% × {Math.round(style.y)}%</p>
          <div className="review-actions">{[["Top", 18], ["Middle", 50], ["Lower", 72], ["Bottom", 86]].map(([n, y]) => <Button key={n} size="sm" variant="ghost" onClick={() => setCustom((x) => ({ ...x, x: 50, y: y as number }))}>{n}</Button>)}</div>
          <h3>Caption text</h3>
          {!cues.length ? <p className="caption muted">Transcribe the clip to get captions, then fix any word here.</p> :
            <div className="cue-list">{cues.map((q2, i) => <label key={i} className={now >= q2.start_ms && now < q2.end_ms ? "on" : ""}><small>{((q2.start_ms - start) / 1000).toFixed(1)}s</small><input value={q2.text} onChange={(e) => setCues((x) => x.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))} /></label>)}</div>}
          <p className="caption muted">{words.length} words</p>
        </>}
        {tab === "Title" && <div className="editor-fields">
          <label>Title text<input value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} /></label>
          <label>Style<select value={titleStyle} onChange={(e) => setTitleStyle(e.target.value as TitleStyle)}>{TITLE_STYLES.map((t) => <option key={t} value={t}>{TITLE_STYLE_NAMES[t]}</option>)}</select></label>
          {titleStyle === "headline" && <><label>Highlighted word<input value={ov.title?.highlight_word ?? ""} onChange={(e) => setOv((o) => ({ ...o, title: { y: o.title?.y ?? 14, ...o.title, highlight_word: e.target.value } }))} /></label>
            <label>Highlight colour<select value={ov.title?.highlight ?? "yellow"} onChange={(e) => setOv((o) => ({ ...o, title: { y: o.title?.y ?? 14, ...o.title, highlight: e.target.value as keyof typeof HIGHLIGHTS } }))}>{Object.keys(HIGHLIGHTS).map((k) => <option key={k}>{k}</option>)}</select></label></>}
          <label>Position (from top)<input type="range" min={4} max={60} value={ov.title?.y ?? 14} onChange={(e) => setOv((o) => ({ ...o, title: { ...o.title, y: +e.target.value } }))} /></label>
          <Button size="sm" variant="ghost" onClick={() => setTitle("")}>Remove title</Button>
        </div>}
        {tab === "Watermark" && <div className="editor-fields">
          <label>Handle<input value={mark} placeholder="@yourhandle" maxLength={60} onChange={(e) => setMark(e.target.value)} /></label>
          <label>Position<select value={ov.watermark?.pos ?? "centre-below-captions"} onChange={(e) => setOv((o) => ({ ...o, watermark: { opacity: o.watermark?.opacity ?? 0.5, pos: e.target.value as WatermarkPos } }))}>{WATERMARK_POS.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label>Opacity<select value={ov.watermark?.opacity ?? 0.5} onChange={(e) => setOv((o) => ({ ...o, watermark: { pos: o.watermark?.pos ?? "centre-below-captions", opacity: +e.target.value } }))}>{[0.3, 0.5, 0.8].map((v) => <option key={v} value={v}>{v * 100}%</option>)}</select></label>
        </div>}
        {tab === "Layout" && <div className="review-actions">{ASPECTS.map((a) => <Button key={a} size="sm" variant={aspect === a ? "default" : "outline"} onClick={() => setAspect(a)}>{a}</Button>)}<p className="caption muted">Switching aspect crops around the centre; the export uses this size.</p></div>}
        <h3>Apply to other clips</h3>
        <p className="caption muted">Copies this caption style and position, title style, watermark and aspect onto the clips you tick (each keeps its own caption words).</p>
        <div className="cue-list apply-list">{q.data!.others.map((o) => <label key={o.id} className="lib-check"><input type="checkbox" checked={applyTo.includes(o.id)} onChange={(e) => setApplyTo((x) => (e.target.checked ? [...x, o.id] : x.filter((y) => y !== o.id)))} />{o.title ?? "Clip"} <small className="muted">{o.status.toLowerCase()}</small></label>)}</div>
        <Button size="sm" disabled={!applyTo.length} onClick={async () => { const p = patch(); const { captions: _c, title_text: _t, ...shared } = p; try { await saveFinish({ data: { ids: applyTo, patch: shared } }); await saveFinish({ data: { ids: [clipId], patch: p } }); toast.success(`Applied to ${applyTo.length} clips`); setApplyTo([]); await qc.invalidateQueries({ queryKey: ["review"] }); } catch (e) { err(e); } }}><Wand2 />Apply to {applyTo.length || ""} selected</Button>
      </section>
      <Preview src={src} videoUrl={c.video_url} start={start} end={end} aspect={aspect} style={style} cues={captionsOn ? cues : []} title={title} titleStyle={titleStyle} ov={ov} mark={mark} onTime={setNow} onMove={(x, y) => setCustom((s) => ({ ...s, x, y }))} />
    </div>
    {posting && c.video_url && <Distribute clip={{ id: c.id, title: c.title, duration_ms: c.duration_ms, aspect: c.aspect, watermark_text: mark }} onClose={() => setPosting(false)} />}
    <p className="caption muted"><Sparkles size={12} /> The preview draws captions over the source; Export burns the same captions, title and handle into the video.</p>
  </div>;
}

function Preview({ src, videoUrl, start, end, aspect, style, cues, title, titleStyle, ov, mark, onTime, onMove }: { src: string | null; videoUrl: string | null; start: number; end: number; aspect: string; style: CaptionStyle; cues: Cue[]; title: string; titleStyle: TitleStyle; ov: Overlays; mark: string; onTime: (ms: number) => void; onMove: (x: number, y: number) => void }) {
  const box = useRef<HTMLDivElement>(null); const [w, setW] = useState(360); const [t, setT] = useState(start); const drag = useRef(false);
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); return () => ro.disconnect(); }, []);
  const k = w / 1080;
  const cue = cueAt(cues, t);
  const text = cue ? (style.uppercase ? cue.text.toUpperCase() : cue.text) : "";
  const ws = text.split(/\s+/).filter(Boolean);
  const activeIdx = cue ? Math.min(ws.length - 1, Math.floor(((t - cue.start_ms) / Math.max(1, cue.end_ms - cue.start_ms)) * ws.length)) : -1;
  const shown = style.animation === "typewriter" ? ws.slice(0, activeIdx + 1) : ws;
  const move = (e: React.PointerEvent) => { if (!drag.current || !box.current) return; const r = box.current.getBoundingClientRect(); onMove(Math.max(5, Math.min(95, ((e.clientX - r.left) / r.width) * 100)), Math.max(5, Math.min(95, ((e.clientY - r.top) / r.height) * 100))); };
  const url = src ? `${src}#t=${start / 1000},${end / 1000}` : videoUrl;
  const hw = (ov.title?.highlight_word ?? "").toLowerCase();
  const pos = ov.watermark?.pos ?? "centre-below-captions";
  return <section className="glass-panel editor-preview">
    <div ref={box} className="editor-frame" style={{ aspectRatio: ratio(aspect) }} onPointerMove={move} onPointerUp={() => (drag.current = false)} onPointerLeave={() => (drag.current = false)}>
      {url ? <video src={url} controls playsInline onTimeUpdate={(e) => { const ms = src ? e.currentTarget.currentTime * 1000 : start + e.currentTarget.currentTime * 1000; setT(ms); onTime(ms); if (src && ms >= end) { e.currentTarget.pause(); } }} /> : <p className="muted">No video available.</p>}
      {title.trim() && <div className={`ed-title ed-${titleStyle}`} style={{ top: `${ov.title?.y ?? 14}%`, fontSize: 66 * k }}>{title.split(/\s+/).map((x, i) => <span key={i} style={titleStyle === "headline" && hw && x.toLowerCase().replace(/[^\w']/g, "") === hw.replace(/[^\w']/g, "") ? { color: HIGHLIGHTS[ov.title?.highlight ?? "yellow"] } : undefined}>{x} </span>)}</div>}
      {text && <div className="ed-caption" onPointerDown={(e) => { drag.current = true; e.preventDefault(); }} style={{ left: `${style.x}%`, top: `${style.y}%`, fontSize: style.size * k, color: style.fill, WebkitTextStroke: style.box ? undefined : `${style.outlineW * k}px ${style.outline}`, paintOrder: "stroke fill", textShadow: style.shadow && !style.box ? `0 ${3 * k}px ${4 * k}px rgba(0,0,0,.5)` : undefined, background: style.box ? `color-mix(in srgb, ${style.boxColor} ${style.boxOpacity * 100}%, transparent)` : undefined }}>
        {shown.map((x, i) => <span key={i} style={style.active && style.animation === "karaoke" && i === activeIdx ? { color: style.active } : undefined}>{x} </span>)}</div>}
      {mark.trim() && <div className={`ed-mark ed-${pos}`} style={{ fontSize: 34 * k, opacity: ov.watermark?.opacity ?? 0.5, ...(pos === "centre-below-captions" ? { top: `calc(${style.y}% + ${style.size * k * 1.4}px)` } : {}) }}>{mark}</div>}
    </div>
    <p className="caption muted">{cues.length ? "Drag the caption to place it." : "Transcribe to see captions here."}</p>
  </section>;
}
