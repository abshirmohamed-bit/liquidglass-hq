import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Upload, Link2, Trash2, RotateCcw, Pencil, Scissors, Film, FileText, Send, Wand2, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { engineAccount, listLibrary, uploadStart, uploadComplete, engineImport, pollImports, renameItem, trashItem, restoreItem, deleteForever, setBrollMeta, engineCatalog, attachSubtitles, nativeSource } from "@/lib/library.functions";
import { supabase } from "@/integrations/supabase/client";
import { inspectVideo } from "@/lib/media-render";
import { LIMITS_TEXT, validateUpload, kindOf, formatBytes, formatDuration, resolutionBadge, upscaleNote, BROLL_TAGS, ASSET_TAB_SOURCE } from "@/lib/library-rules";

const TABS = ["Sources", "Finished clips", "Projects", "B-roll", "Music", "Sound effects", "Images", "Fonts", "Trash"] as const;
type Tab = (typeof TABS)[number];
const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");
type Progress = { name: string; pct: number; error?: string | undefined; retry?: (() => void) | undefined };

function putFile(url: string, method: string, headers: Record<string, string>, file: File, onPct: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest(); x.open(method, url);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status < 300 ? resolve() : reject(new Error(`Upload failed (${x.status})`)));
    x.onerror = () => reject(new Error("Network error during upload"));
    x.send(file);
  });
}

export function Library() {
  const qc = useQueryClient();
  const acct = useQuery({ queryKey: ["engine-account"], queryFn: () => engineAccount() });
  const lib = useQuery({ queryKey: ["library"], queryFn: () => listLibrary(), refetchInterval: (q) => (q.state.data?.sources.some((s) => s.status === "UPLOADING" && s.kind === "LINK") ? 8000 : false) });
  const [tab, setTab] = useState<Tab>("Sources");
  const [progress, setProgress] = useState<Progress[]>([]);
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ["library"] }); await qc.invalidateQueries({ queryKey: ["engine-account"] }); };
  const connected = acct.data?.connected;

  // poll link imports still downloading
  useQuery({ queryKey: ["library-poll"], enabled: !!connected && !!lib.data?.sources.some((s) => s.status === "UPLOADING" && s.kind === "LINK"), refetchInterval: 8000,
    queryFn: async () => { const r = await pollImports(); if (r.changed) await refresh(); return r; } });

  async function uploadOne(file: File, source: "UPLOAD" | "BROLL" | "MUSIC" | "SFX" | "IMAGE" | "FONT", tags: string[] = [], subtitle?: File) {
    const bad = validateUpload(file.name, file.size); if (bad) { toast.error(`${file.name}: ${bad}`); return; }
    const set = (p: Partial<Progress>) => setProgress((all) => all.map((x) => (x.name === file.name ? { ...x, ...p } : x)));
    setProgress((all) => [...all.filter((x) => x.name !== file.name), { name: file.name, pct: 0 }]);
    if (!connected && source === "UPLOAD" && kindOf(file.name) === "VIDEO") {
      // Internal engine: store the file in the app's own storage and record it READY.
      try {
        const meta = await inspectVideo(file);
        const ws = (await supabase.rpc("workspace_of", { _uid: (await supabase.auth.getUser()).data.user!.id })).data as string;
        const id = crypto.randomUUID(); const ext = file.name.split(".").pop() ?? "mp4";
        const path = `${ws}/sources/${id}.${ext}`;
        set({ pct: 5 });
        const up = await supabase.storage.from("media").upload(path, file, { contentType: file.type || "video/mp4" });
        if (up.error) throw new Error(up.error.message);
        let thumbPath: string | null = null;
        if (meta.thumb) { const tp = `${ws}/sources/${id}.jpg`; if (!(await supabase.storage.from("media").upload(tp, meta.thumb, { contentType: "image/jpeg" })).error) thumbPath = tp; }
        await nativeSource({ data: { name: file.name, path, thumbPath, sizeBytes: file.size, durationMs: meta.durationMs, width: meta.width, height: meta.height } });
        setProgress((all) => all.filter((x) => x.name !== file.name)); toast.success(`${file.name} is ready`);
      } catch (e) { setProgress((all) => all.filter((x) => x.name !== file.name)); err(e); }
      await refresh(); return;
    }
    try {
      const s = await uploadStart({ data: { filename: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size, source, tags } });
      await refresh();
      const attempt = async () => {
        try {
          set({ error: undefined, retry: undefined });
          await putFile(s.url, s.method, s.headers, file, (pct) => set({ pct }));
          await uploadComplete({ data: { uploadId: s.uploadId, rowId: s.rowId, table: s.table } });
          if (subtitle && s.table === "source_assets" && s.rowId) await uploadSubtitle(subtitle, s.rowId);
          setProgress((all) => all.filter((x) => x.name !== file.name)); toast.success(`${file.name} is ready`);
        } catch (e) { set({ error: e instanceof Error ? e.message : "Upload failed", retry: attempt }); }
        await refresh();
      };
      await attempt();
    } catch (e) { setProgress((all) => all.filter((x) => x.name !== file.name)); err(e); await refresh(); }
  }
  async function uploadSubtitle(file: File, sourceId: string) {
    const bad = validateUpload(file.name, file.size); if (bad || kindOf(file.name) !== "SUBTITLE") throw new Error(bad ?? "Subtitles must be .srt or .vtt");
    const s = await uploadStart({ data: { filename: file.name, contentType: "text/plain", sizeBytes: file.size, source: "UPLOAD" } }).catch(() => null);
    if (!s) throw new Error("Could not upload subtitles");
    await putFile(s.url, s.method, s.headers, file, () => {});
    const done = await uploadComplete({ data: { uploadId: s.uploadId, rowId: null, table: "subtitle" } });
    if (done.url) await attachSubtitles({ data: { sourceId, srtUrl: done.url } });
  }

  return <div className="page library-page">
    <header className="page-header"><div><h1>Library</h1><p className="page-subtitle">Your uploads and imported sources.</p></div></header>


    <UploadCard disabled={false} linkDisabled={!connected} onFiles={(files, sub) => files.forEach((f) => uploadOne(f, "UPLOAD", [], sub))} onImported={async (id, sub) => { if (id && sub) { try { await uploadSubtitle(sub, id); } catch (e) { err(e); } } await refresh(); }} />
    {progress.length > 0 && <section className="glass-panel lib-progress">{progress.map((p) => <div key={p.name} className="lib-progress-row"><span>{p.name}</span><div className="lib-bar"><i style={{ width: `${p.pct}%` }} /></div><span>{p.error ? <>{p.error} <Button size="sm" variant="outline" onClick={p.retry}>Resume</Button></> : `${p.pct}%`}</span></div>)}</section>}
    <nav className="lib-tabs" role="tablist">{TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}</nav>
    {lib.isLoading ? <p className="muted">Loading…</p> : lib.data && <TabBody tab={tab} data={lib.data} refresh={refresh} connected={!!connected} upload={uploadOne} />}
  </div>;
}

function StatusStrip({ account }: { account: { used: number; limit: number; pending: number; wait: number } | null }) {
  return <section className="glass-panel lib-strip" aria-label="Engine status">
    <div><span className="panel-label">Storage</span><strong>{account ? `${formatBytes(account.used)} of ${formatBytes(account.limit)}` : "—"}</strong>{account && account.limit ? <div className="lib-bar"><i style={{ width: `${Math.min(100, (account.used / account.limit) * 100)}%` }} /></div> : null}</div>
    <div><span className="panel-label">Jobs in queue</span><strong>{account ? account.pending : "—"}</strong></div>
    <div><span className="panel-label">Estimated wait</span><strong>{account ? `${account.wait} min` : "—"}</strong></div>
  </section>;
}

function UploadCard({ disabled, linkDisabled, onFiles, onImported }: { disabled: boolean; linkDisabled: boolean; onFiles: (f: File[], sub?: File) => void; onImported: (id?: string, sub?: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [url, setUrl] = useState(""); const [rights, setRights] = useState(false); const [busy, setBusy] = useState(false);
  const [sub, setSub] = useState<File | undefined>();
  const take = (list: FileList | null) => { const fs = Array.from(list ?? []); const s = fs.find((f) => kindOf(f.name) === "SUBTITLE"); onFiles(fs.filter((f) => f !== s), s ?? sub); };
  async function doImport() {
    setBusy(true);
    try { const r = await engineImport({ data: { url: url.trim(), rightsConfirmed: rights } }); toast.success(r.ready ? "Imported and ready" : "Importing — this can take a few minutes"); setUrl(""); setRights(false); onImported(r.id, sub); }
    catch (e) { err(e); } finally { setBusy(false); }
  }
  return <section className={`glass-panel lib-upload${drag ? " drag" : ""}`} aria-disabled={disabled}
    onDragOver={(e) => { e.preventDefault(); if (!disabled) setDrag(true); }} onDragLeave={() => setDrag(false)}
    onDrop={(e) => { e.preventDefault(); setDrag(false); if (!disabled) take(e.dataTransfer.files); }}>
    <button type="button" className="lib-drop" disabled={disabled} onClick={() => input.current?.click()}><Upload /><span>Drag and drop files, or click to browse</span></button>
    <input ref={input} type="file" multiple hidden aria-label="Upload files" onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
    <label className="lib-check"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} disabled={disabled} />I own this footage or have the rights to clip it</label>
    <label className="lib-check">Subtitles (optional .srt or .vtt): <input type="file" accept=".srt,.vtt" disabled={disabled} onChange={(e) => setSub(e.target.files?.[0])} /></label>
    <p className="caption muted">{LIMITS_TEXT}</p>
  </section>;
}

type Lib = Awaited<ReturnType<typeof listLibrary>>;
type Upload = (f: File, s: "UPLOAD" | "BROLL" | "MUSIC" | "SFX" | "IMAGE" | "FONT", tags?: string[]) => void;

function TabBody({ tab, data, refresh, connected, upload }: { tab: Tab; data: Lib; refresh: () => Promise<void>; connected: boolean; upload: Upload }) {
  if (tab === "Sources") return <Sources rows={data.sources.filter((s) => s.status !== "TRASHED")} refresh={refresh} />;
  if (tab === "Finished clips") return data.clips.length ? <div className="lib-grid">{data.clips.map((c) => <article key={c.id} className="glass-panel lib-card">{c.thumbnail_url ? <img src={c.thumbnail_url} alt="" /> : <div className="lib-thumb"><Film /></div>}<h3>{c.title ?? "Clip"}</h3><p className="caption muted">{formatDuration(c.duration_ms)}</p>{c.video_url && <a href={c.video_url} target="_blank" rel="noreferrer">Play</a>}</article>)}</div> : <Empty text="Finished clips appear here once clips are exported." />;
  if (tab === "Projects") return <Empty text="Projects arrive with the daily Inbox." />;
  if (tab === "Trash") return <Trash data={data} refresh={refresh} />;
  return <AssetTab tab={tab} rows={data.assets.filter((a) => a.source === ASSET_TAB_SOURCE[tab] && a.status !== "TRASHED")} refresh={refresh} connected={connected} upload={upload} />;
}
const Empty = ({ text }: { text: string }) => <section className="glass-panel lib-empty"><p className="muted">{text}</p></section>;

function Sources({ rows, refresh }: { rows: Lib["sources"]; refresh: () => Promise<void> }) {
  const [filter, setFilter] = useState<"All" | "Ready" | "Failed">("All"); const [q, setQ] = useState("");
  const list = useMemo(() => rows.filter((r) => (filter === "All" || r.status === filter.toUpperCase()) && r.name.toLowerCase().includes(q.toLowerCase())), [rows, filter, q]);
  return <>
    <div className="lib-filters"><div className="seg">{(["All", "Ready", "Failed"] as const).map((f) => <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{f}</button>)}</div><span className="caption muted">Newest first</span><input aria-label="Search sources" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} /></div>
    {list.length ? <div className="lib-grid">{list.map((s) => <SourceCard key={s.id} s={s} refresh={refresh} />)}</div> : <Empty text="No sources yet. Upload a video or paste a link above." />}
  </>;
}

function SourceCard({ s, refresh }: { s: Lib["sources"][number]; refresh: () => Promise<void> }) {
  const badge = resolutionBadge(s.width, s.height); const note = upscaleNote(s.source_height ?? s.height);
  const ready = s.status === "READY"; const short = (s.duration_ms ?? Infinity) <= 15 * 60 * 1000;
  const later = (what: string) => toast.info(`${what} comes in a later step of the build.`);
  return <article className="glass-panel lib-card" title={note ?? undefined}>
    {s.thumbnail_url ? <img src={s.thumbnail_url} alt="" /> : <div className="lib-thumb"><Film /></div>}
    <div className="lib-card-head"><h3>{s.name}</h3><span className={`pill pill-${s.status.toLowerCase()}`}>{s.status === "UPLOADING" ? "Uploading" : s.status === "READY" ? "Ready" : "Failed"}</span></div>
    <p className="caption muted">{formatDuration(s.duration_ms)} · {formatBytes(s.size_bytes)} {badge && <span className="pill">{badge}</span>} {s.niche && <span className="pill">{s.niche}</span>}</p>
    {note && <p className="caption lib-note">{note}</p>}
    {s.error && <p className="caption text-destructive">{s.error}</p>}
    <div className="lib-actions">
      <a className={`btn-chip${ready ? "" : " disabled"}`} href={ready ? `/clips?source=${s.id}` : undefined}><Scissors />Make clips</a>
      <button className="btn-chip" disabled={!ready} onClick={() => later("Cut by hand")}><Scissors />Cut by hand</button>
      {short && <button className="btn-chip" disabled={!ready} onClick={() => later("Edit clip")}><Wand2 />Edit clip</button>}
      <button className="btn-chip" disabled={!ready} onClick={() => later("Transcribe")}><FileText />Transcribe</button>
      <button className="btn-chip" disabled={!ready} onClick={() => later("Posting")}><Send />Post</button>
      <RenameTrash id={s.id} name={s.name} table="source_assets" refresh={refresh} />
    </div>
  </article>;
}

function RenameTrash({ id, name, table, refresh }: { id: string; name: string; table: "source_assets" | "assets"; refresh: () => Promise<void> }) {
  return <>
    <button className="btn-chip" onClick={async () => { const n = prompt("Rename", name); if (n && n.trim() && n !== name) { try { await renameItem({ data: { id, table, name: n } }); await refresh(); } catch (e) { err(e); } } }}><Pencil />Rename</button>
    <button className="btn-chip" onClick={async () => { try { await trashItem({ data: { id, table } }); toast.success("Moved to Trash"); await refresh(); } catch (e) { err(e); } }}><Trash2 />Move to Trash</button>
  </>;
}

function AssetTab({ tab, rows, refresh, connected, upload }: { tab: Exclude<Tab, "Sources" | "Finished clips" | "Projects" | "Trash">; rows: Lib["assets"]; refresh: () => Promise<void>; connected: boolean; upload: Upload }) {
  const input = useRef<HTMLInputElement>(null); const [tag, setTag] = useState<string>(BROLL_TAGS[0] ?? "gameplay");
  const source = ASSET_TAB_SOURCE[tab];
  const accept = { BROLL: "video/*", MUSIC: ".mp3,.m4a,.wav,.aac,.ogg,.flac", SFX: ".mp3,.m4a,.wav,.aac,.ogg,.flac", IMAGE: ".jpg,.jpeg,.png,.webp,.gif", FONT: ".ttf,.otf,.woff2" }[source];
  const catalog = useQuery({ queryKey: ["engine-catalog", source], enabled: connected && (source === "MUSIC" || source === "SFX"), queryFn: () => engineCatalog({ data: { kind: source === "MUSIC" ? "music" : "sfx" } }) });
  return <>
    <div className="lib-filters">
      {source === "BROLL" && <select aria-label="B-roll tag" value={tag} onChange={(e) => setTag(e.target.value)}>{BROLL_TAGS.map((t) => <option key={t}>{t}</option>)}</select>}
      <Button disabled={!connected} onClick={() => input.current?.click()}><Upload />Upload {tab.toLowerCase()}</Button>
      <input ref={input} type="file" hidden multiple accept={accept} aria-label={`Upload ${tab}`} onChange={(e) => { Array.from(e.target.files ?? []).forEach((f) => upload(f, source, source === "BROLL" ? [tag] : [])); e.target.value = ""; }} />
      {(source === "BROLL" || source === "MUSIC" || source === "FONT") && <span className="caption muted">Only upload {source === "FONT" ? "fonts" : "footage or tracks"} you own or have licensed.</span>}
    </div>
    {rows.length ? <div className="lib-grid">{rows.map((a) => <article key={a.id} className="glass-panel lib-card">
      {source === "FONT" && a.url ? <><style>{`@font-face{font-family:"f-${a.id}";src:url("${a.url}")}`}</style><p className="lib-font-sample" style={{ fontFamily: `"f-${a.id}"` }}>The quick brown fox jumps over the lazy dog</p></>
        : source === "IMAGE" && a.url ? <img src={a.url} alt={a.name} /> : source === "BROLL" && a.url ? <video src={a.url} muted loop playsInline /> : (source === "MUSIC" || source === "SFX") && a.url ? <audio src={a.url} controls /> : <div className="lib-thumb"><Film /></div>}
      <div className="lib-card-head"><h3>{a.name}</h3><span className={`pill pill-${a.status.toLowerCase()}`}>{a.status === "UPLOADING" ? "Uploading" : a.status === "READY" ? "Ready" : "Failed"}</span></div>
      <p className="caption muted">{formatBytes(a.size_bytes)}{Array.isArray(a.tags) && a.tags.length ? ` · ${(a.tags as string[]).join(", ")}` : ""}</p>
      {a.error && <p className="caption text-destructive">{a.error}</p>}
      <div className="lib-actions">
        {source === "BROLL" && <button className="btn-chip" onClick={async () => { try { await setBrollMeta({ data: { id: a.id, tags: (a.tags as string[]) ?? [], isDefault: !a.is_default } }); await refresh(); } catch (e) { err(e); } }}><Star />{a.is_default ? "Default" : "Make default"}</button>}
        <RenameTrash id={a.id} name={a.name} table="assets" refresh={refresh} />
      </div>
    </article>)}</div> : <Empty text={`No ${tab.toLowerCase()} yet.`} />}
    {false && <section className="glass-panel lib-catalog"><h2>Engine starter pack</h2>{catalog.data?.length ? <ul>{catalog.data.map((m) => <li key={m.id}><span>{m.name}</span>{m.url ? <audio src={m.url} controls /> : null}{m.licence ? <a href={m.licence} target="_blank" rel="noreferrer">Licence</a> : null}</li>)}</ul> : <p className="muted">No bundled tracks returned by the Engine.</p>}</section>}
  </>;
}

function Trash({ data, refresh }: { data: Lib; refresh: () => Promise<void> }) {
  const items = [...data.sources.filter((s) => s.status === "TRASHED").map((s) => ({ id: s.id, name: s.name, size: s.size_bytes ?? 0, at: s.trashed_at, table: "source_assets" as const })),
    ...data.assets.filter((a) => a.status === "TRASHED").map((a) => ({ id: a.id, name: a.name, size: a.size_bytes ?? 0, at: a.trashed_at, table: "assets" as const }))];
  const total = items.reduce((n, i) => n + i.size, 0);
  const del = async (ids: { id: string; table: "source_assets" | "assets" }[]) => { if (!confirm(ids.length > 1 ? "Delete everything in Trash forever?" : "Delete forever?")) return; try { await deleteForever({ data: { ids } }); toast.success("Deleted"); await refresh(); } catch (e) { err(e); } };
  return <>
    <div className="lib-filters"><span>Trash holds <strong>{formatBytes(total)}</strong> · items are deleted forever after 30 days</span><Button variant="destructive" disabled={!items.length} onClick={() => del(items.map(({ id, table }) => ({ id, table })))}>Empty trash</Button></div>
    {items.length ? <div className="lib-grid">{items.map((i) => <article key={i.id} className="glass-panel lib-card"><h3>{i.name}</h3><p className="caption muted">{formatBytes(i.size)} · trashed {i.at ? new Date(i.at).toLocaleDateString() : ""}</p><div className="lib-actions">
      <button className="btn-chip" onClick={async () => { try { await restoreItem({ data: { id: i.id, table: i.table } }); toast.success("Restored"); await refresh(); } catch (e) { err(e); } }}><RotateCcw />Restore</button>
      <button className="btn-chip" onClick={() => del([{ id: i.id, table: i.table }])}><Trash2 />Delete forever</button></div></article>)}</div> : <Empty text="Trash is empty." />}
  </>;
}
