import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowUp, BookOpen, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { agencyQuery } from "@/lib/agency-query";
import { deleteKnowledge, listKnowledge, resetKnowledge, summarizeKnowledge, trainKnowledge, updateKnowledge } from "@/lib/training.functions";
import type { TrainingKind } from "@/lib/training-rules";

type Entry = { id: string; user_input: string | null; learned_principle: string | null; timestamp: string | null };

export function AiTraining() {
  const [kind, setKind] = useState<TrainingKind>("THUMBNAIL");
  const { data: agency } = useSuspenseQuery(agencyQuery);
  const [clientId, setClientId] = useState("");
  return (
    <section className="detail-section training-section">
      <div className="section-toolbar">
        <h2>AI Training</h2>
        <div className="actions">
          <Button size="sm" variant={kind === "THUMBNAIL" ? "secondary" : "ghost"} onClick={() => setKind("THUMBNAIL")}>Thumbnail Training</Button>
          <Button size="sm" variant={kind === "VIDEO" ? "secondary" : "ghost"} onClick={() => setKind("VIDEO")}>Video & Ideation Training</Button>
          <select aria-label="Knowledge for" className="chat-client-select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Global (all clients)</option>
            {agency.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <Trainer key={`${kind}-${clientId}`} kind={kind} clientId={clientId || null} />
    </section>
  );
}

function Trainer({ kind, clientId }: { kind: TrainingKind; clientId: string | null }) {
  const key = ["knowledge", kind, clientId];
  const entries = useQuery({ queryKey: key, queryFn: () => listKnowledge({ data: { kind, clientId } }) });
  const cache = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const refresh = () => cache.invalidateQueries({ queryKey: key });
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [entries.data, pending]);
  async function send(text: string) {
    if (!text.trim() || pending) return;
    setPending(text);
    try {
      await trainKnowledge({ data: { kind, clientId, input: text } });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Training failed.");
    } finally {
      setPending(null);
    }
  }
  const rows = (entries.data ?? []) as Entry[];
  return (
    <div className="trainer">
      <div className="actions trainer-actions">
        <span className="chart-caption">{rows.length} {rows.length === 1 ? "entry" : "entries"} · {clientId ? "client-specific" : "global"}</span>
        <Button size="sm" variant="outline" onClick={async () => { setSummaryOpen(true); setSummary(null); try { setSummary(await summarizeKnowledge({ data: { kind, clientId } })); } catch (e) { setSummary(e instanceof Error ? e.message : "Could not summarize."); } }}><BookOpen />View Current Knowledge</Button>
        <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => setResetOpen(true)}><RotateCcw />Reset Knowledge</Button>
      </div>
      <div className="trainer-log">
        {entries.isLoading && <Shimmer>Loading knowledge…</Shimmer>}
        {!entries.isLoading && !rows.length && !pending && <p className="chart-caption">Paste examples, principles, references or explanations to teach the AI.</p>}
        {rows.map((e) => (
          <div key={e.id} className="trainer-entry">
            <div className="thumb-bubble user trainer-input">{(e.user_input ?? "").length > 1500 ? `${e.user_input!.slice(0, 1500)}… (${e.user_input!.length.toLocaleString()} characters saved)` : e.user_input}</div>
            <div className="thumb-bubble"><MessageResponse>{e.learned_principle ?? ""}</MessageResponse></div>
            <div className="actions">
              <small className="chart-caption">{e.timestamp ? new Date(e.timestamp).toLocaleString() : ""}</small>
              <Button size="icon-sm" variant="ghost" aria-label="Edit entry" onClick={() => setEditing(e)}><Pencil /></Button>
              <Button size="icon-sm" variant="ghost" aria-label="Delete entry" onClick={async () => { if (!confirm("Delete this knowledge entry?")) return; try { await deleteKnowledge({ data: { id: e.id } }); await refresh(); } catch { toast.error("Could not delete."); } }}><Trash2 /></Button>
            </div>
          </div>
        ))}
        {pending && <><div className="thumb-bubble user trainer-input">{pending.slice(0, 1500)}</div><Shimmer>Learning…</Shimmer></>}
        <div ref={end} />
      </div>
      <PromptInput onSubmit={({ text }) => { void send(text); }} className="chat-composer">
        <PromptInputTextarea aria-label="Training input" placeholder={kind === "THUMBNAIL" ? "Paste thumbnail examples, principles or references…" : "Paste video, title or ideation principles…"} />
        <PromptInputFooter className="justify-end">
          <PromptInputSubmit aria-label="Train" disabled={!!pending} status={pending ? "submitted" : "ready"}><ArrowUp /></PromptInputSubmit>
        </PromptInputFooter>
      </PromptInput>
      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="training-summary"><DialogTitle>Current knowledge</DialogTitle><DialogDescription>Summary of every entry, grouped by topic.</DialogDescription>{summary === null ? <Shimmer>Reading all entries…</Shimmer> : <div className="training-summary-body"><MessageResponse>{summary}</MessageResponse></div>}</DialogContent>
      </Dialog>
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent><DialogTitle>Reset knowledge?</DialogTitle><DialogDescription>This permanently deletes all {rows.length} {clientId ? "client-specific" : "global"} {kind === "THUMBNAIL" ? "thumbnail" : "video"} entries.</DialogDescription><div className="actions"><Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button><Button variant="destructive" onClick={async () => { try { await resetKnowledge({ data: { kind, clientId } }); await refresh(); setResetOpen(false); } catch { toast.error("Could not reset."); } }}>Reset knowledge</Button></div></DialogContent>
      </Dialog>
      {editing && <EditEntry entry={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}

function EditEntry({ entry, onClose, onSaved }: { entry: Entry; onClose: () => void; onSaved: () => void }) {
  const [input, setInput] = useState(entry.user_input ?? "");
  const [principle, setPrinciple] = useState(entry.learned_principle ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent>
        <DialogTitle>Edit knowledge entry</DialogTitle>
        <DialogDescription>The learned principle is what the AI uses.</DialogDescription>
        <form className="agency-form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await updateKnowledge({ data: { id: entry.id, user_input: input, learned_principle: principle } }); onSaved(); onClose(); } catch (err) { toast.error(err instanceof Error ? err.message : "Could not save."); } finally { setBusy(false); } }}>
          <label>Your input<textarea rows={5} value={input} onChange={(e) => setInput(e.target.value)} /></label>
          <label>Learned principle<textarea rows={6} required value={principle} onChange={(e) => setPrinciple(e.target.value)} /></label>
          <div className="actions"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy} type="submit">{busy ? "Saving…" : "Save entry"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
