import { useEffect, useRef, useState } from "react";
import { useQuery, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUp, Download, ImageIcon, PanelRight, Plus, RefreshCw, Sparkles, Star, Type } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { agencyQuery } from "@/lib/agency-query";
import { thumbnailMessagesQuery, thumbnailSessionsQuery } from "@/lib/thumbnail-query";
import { generateThumbnail, loadThumbnailImage, rateThumbnail, saveOverlay, sendThumbnailMessage } from "@/lib/thumbnails.functions";
import { groupMessages, type ThumbRow } from "@/lib/thumbnail-rules";

type Row = ThumbRow & { session_id: string };
const promptOf = (m: Row) => (m.content ?? "").split("\n").slice(1).join("\n");

function ConnectKey() {
  return (
    <div className="notice thumb-connect" role="status">
      <p>This tool will be available once you connect your API key.</p>
      <details>
        <summary>Here’s how</summary>
        <p>Create an API key and secret in your Higgsfield account, then add them in Settings as your Higgsfield key and secret. Your chat keeps working in the meantime.</p>
      </details>
    </div>
  );
}

export function Thumbnails({ sessionId }: { sessionId?: string | undefined }) {
  const { data: agency } = useSuspenseQuery(agencyQuery);
  const { data: list } = useSuspenseQuery(thumbnailSessionsQuery);
  const session = list.sessions.find((s) => s.id === sessionId);
  const [clientId, setClientId] = useState(session?.client_id ?? agency.clients[0]?.id ?? "");
  const [panel, setPanel] = useState(true);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "thinking" | "generating">("idle");
  const [variationsBusy, setVariationsBusy] = useState(false);
  const [missingKey, setMissingKey] = useState(!list.connected);
  const [overlay, setOverlay] = useState<Row | null>(null);
  const navigate = useNavigate();
  const cache = useQueryClient();
  const messages = useQuery({ ...thumbnailMessagesQuery(sessionId ?? ""), enabled: !!sessionId });
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (session) setClientId(session.client_id);
    return undefined;
  }, [session]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.data, pending, phase]);

  const refresh = (id: string) => Promise.all([cache.invalidateQueries({ queryKey: ["thumbnails", id] }), cache.invalidateQueries({ queryKey: ["thumbnails"], exact: true })]);
  async function generate(id: string, prompt: string, variations: boolean) {
    variations ? setVariationsBusy(true) : setPhase("generating");
    try {
      const r = await generateThumbnail({ data: { sessionId: id, prompt, variations } });
      if (!r.connected) setMissingKey(true);
      await refresh(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image generation failed.");
    } finally {
      variations ? setVariationsBusy(false) : setPhase("idle");
    }
  }
  async function send(text: string) {
    if (!text.trim() || phase !== "idle") return;
    if (!clientId) {
      toast.error("Add a client first so generations can be tagged.");
      return;
    }
    setPending(text);
    setPhase("thinking");
    try {
      const r = await sendThumbnailMessage({ data: { sessionId: sessionId ?? null, clientId, text } });
      if (r.sessionId !== sessionId) await navigate({ to: "/thumbnails", search: { session: r.sessionId } });
      await refresh(r.sessionId);
      setPending(null);
      await generate(r.sessionId, r.imagePrompt, false);
    } catch (e) {
      setPending(null);
      setPhase("idle");
      toast.error(e instanceof Error ? e.message : "Message failed.");
    }
  }
  async function rate(m: Row, rating: number) {
    try {
      await rateThumbnail({ data: { id: m.id, rating } });
      await refresh(m.session_id);
    } catch {
      toast.error("Could not save rating.");
    }
  }
  const filtered = list.sessions.filter((s) => (s.title ?? "").toLowerCase().includes(search.toLowerCase()));
  const groups = agency.clients.map((c) => ({ client: c, sessions: filtered.filter((s) => s.client_id === c.id) })).filter((g) => g.sessions.length);
  const rows = (messages.data ?? []) as Row[];

  const imageCard = (m: Row, compact = false) => (
    <figure className={`thumb-image ${compact ? "compact" : ""}`} key={m.id}>
      <img src={m.image_url!} alt="Generated thumbnail" />
      <figcaption className="thumb-actions">
        {!compact && (
          <>
            <Button size="sm" variant="ghost" disabled={phase !== "idle"} onClick={() => generate(m.session_id, promptOf(m), false)}><RefreshCw />Regenerate</Button>
            <Button size="sm" variant="ghost" disabled={variationsBusy} onClick={() => generate(m.session_id, promptOf(m), true)}><Sparkles />Try 3 variations</Button>
          </>
        )}
        <Button size="sm" variant="ghost" asChild><a href={m.image_url!} download="thumbnail.jpg" target="_blank" rel="noreferrer"><Download />Download</a></Button>
        <Button size="sm" variant="ghost" onClick={() => setOverlay(m)}><Type />Add text overlay</Button>
        <span className="thumb-stars" role="group" aria-label="Rate thumbnail">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`Rate ${n} stars`} aria-pressed={m.rating === n} onClick={() => rate(m, n)}>
              <Star className={(m.rating ?? 0) >= n ? "filled" : ""} />
            </button>
          ))}
        </span>
      </figcaption>
    </figure>
  );

  return (
    <div className="page ideation-page">
      <header className="section-toolbar">
        <h1>Thumbnails</h1>
        <div className="actions">
          <select aria-label="Client" className="chat-client-select" value={clientId} disabled={!!sessionId} onChange={(e) => setClientId(e.target.value)}>
            {!agency.clients.length && <option value="">No clients yet</option>}
            {agency.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button variant="ghost" size="icon" title="New session" aria-label="New session" onClick={() => navigate({ to: "/thumbnails", search: {} })}><Plus /></Button>
          <Button variant="ghost" size="icon" title="Toggle sessions" aria-label="Toggle sessions" onClick={() => setPanel(!panel)}><PanelRight /></Button>
        </div>
      </header>
      <div className={`ideation-layout ${panel ? "with-threads" : ""}`}>
        <div className="chat-workspace">
          <div className="chat-transcript thumb-transcript">
            <div>
              {missingKey && <ConnectKey />}
              {!sessionId && !pending && (
                <div className="chat-greeting thumb-greeting"><ImageIcon /><h2>What thumbnail are we making?</h2></div>
              )}
              {groupMessages(rows).map((g) =>
                Array.isArray(g) ? (
                  <div className="thumb-carousel" key={g[0]?.id} aria-label="Variations">{g.map((m) => imageCard(m, true))}</div>
                ) : g.image_url ? (
                  imageCard(g)
                ) : (
                  <div key={g.id} className={g.role === "user" ? "thumb-bubble user" : "thumb-bubble"}>{g.content}</div>
                ),
              )}
              {pending && <div className="thumb-bubble user">{pending}</div>}
              {phase === "thinking" && <Shimmer className="thumb-thinking">Thinking about the creative direction…</Shimmer>}
              {(phase === "generating" || variationsBusy) && <div className="thumb-skeleton" aria-label="Generating image"><Shimmer>Generating image…</Shimmer></div>}
              <div ref={end} />
            </div>
          </div>
          <PromptInput onSubmit={({ text }) => { void send(text); }} className="chat-composer">
            <PromptInputTextarea aria-label="Message" placeholder="Describe a thumbnail or paste a video topic..." />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit aria-label="Send message" disabled={phase !== "idle"} status={phase === "idle" ? "ready" : "submitted"}><ArrowUp /></PromptInputSubmit>
            </PromptInputFooter>
          </PromptInput>
        </div>
        {panel && (
          <aside className="thread-panel" aria-label="Sessions">
            <h2>Sessions</h2>
            <Input aria-label="Search sessions" placeholder="Search sessions…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="thread-list">
              {groups.map((g) => (
                <div key={g.client.id}>
                  <h3 className="thumb-group">{g.client.name}</h3>
                  {g.sessions.map((s) => (
                    <div key={s.id} className={`thread-row ${s.id === sessionId ? "selected" : ""}`}>
                      <a href={`/thumbnails?session=${s.id}`} onClick={(e) => { e.preventDefault(); navigate({ to: "/thumbnails", search: { session: s.id } }); }}><span>{s.title}</span></a>
                    </div>
                  ))}
                </div>
              ))}
              {!groups.length && <p className="chart-caption">No sessions yet.</p>}
            </div>
          </aside>
        )}
      </div>
      {overlay && <OverlayEditor image={overlay} onClose={() => setOverlay(null)} onSaved={() => refresh(overlay.session_id)} />}
    </div>
  );
}

function OverlayEditor({ image, onClose, onSaved }: { image: Row; onClose: () => void; onSaved: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [text, setText] = useState("BIG TEXT");
  const [font, setFont] = useState("Impact");
  const [size, setSize] = useState(120);
  const [color, setColor] = useState("#ffffff");
  const [pos, setPos] = useState({ x: 80, y: 600 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    loadThumbnailImage({ data: { id: image.id } })
      .then((src) => { const i = new Image(); i.onload = () => setImg(i); i.src = src; })
      .catch(() => toast.error("Could not open this image."));
  }, [image.id]);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !img) return;
    ctx.drawImage(img, 0, 0, 1280, 720);
    ctx.font = `bold ${size}px ${font}, sans-serif`;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(4, size / 14);
    ctx.strokeStyle = "rgba(0,0,0,.85)";
    ctx.strokeText(text, pos.x, pos.y);
    ctx.fillText(text, pos.x, pos.y);
  }, [img, text, font, size, color, pos]);
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 1280, y: ((e.clientY - r.top) / r.height) * 720 };
  };
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="thumb-overlay-dialog">
        <DialogTitle>Add text overlay</DialogTitle>
        <DialogDescription>Drag the text on the image to position it.</DialogDescription>
        <canvas
          ref={canvas}
          width={1280}
          height={720}
          className="thumb-canvas"
          aria-label="Thumbnail canvas"
          onPointerDown={(e) => { const p = point(e); drag.current = { dx: p.x - pos.x, dy: p.y - pos.y }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { if (!drag.current) return; const p = point(e); setPos({ x: p.x - drag.current.dx, y: p.y - drag.current.dy }); }}
          onPointerUp={() => { drag.current = null; }}
        />
        {!img && <Shimmer>Loading image…</Shimmer>}
        <div className="agency-form thumb-overlay-controls">
          <label>Text<input value={text} onChange={(e) => setText(e.target.value)} /></label>
          <label>Font<select value={font} onChange={(e) => setFont(e.target.value)}>{["Impact", "Arial Black", "Helvetica Neue", "Georgia"].map((f) => <option key={f}>{f}</option>)}</select></label>
          <label>Size<input type="number" min={20} max={300} value={size} onChange={(e) => setSize(Number(e.target.value))} /></label>
          <label>Color<input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
        </div>
        <div className="actions">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            disabled={!img || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await saveOverlay({ data: { sessionId: image.session_id, dataUrl: canvas.current!.toDataURL("image/jpeg", 0.85) } });
                onSaved();
                onClose();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not save.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save composite"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
