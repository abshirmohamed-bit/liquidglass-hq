import { useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Sparkles, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getClientTools, generateSuggestions, trainClientTool } from "@/lib/suggestions.functions";
import { deleteKnowledge } from "@/lib/training.functions";
import { clientScope, type Idea, type SuggestionKind, type TitleGroup } from "@/lib/suggestion-rules";

const toolsQuery = (clientId: string) => queryOptions({ queryKey: ["client-tools", clientId], queryFn: () => getClientTools({ data: { clientId } }) });

export function ClientTools({ clientId }: { clientId: string }) {
  return <>
    <Tool clientId={clientId} kind="TITLES" title="Suggested Titles" />
    <Tool clientId={clientId} kind="IDEAS" title="Suggested Ideas" />
  </>;
}

function Tool({ clientId, kind, title }: { clientId: string; kind: SuggestionKind; title: string }) {
  const q = useQuery(toolsQuery(clientId));
  const cache = useQueryClient();
  const generate = useServerFn(generateSuggestions);
  const train = useServerFn(trainClientTool);
  const remove = useServerFn(deleteKnowledge);
  const [busy, setBusy] = useState(false);
  const [training, setTraining] = useState(false);
  const [input, setInput] = useState("");
  const saved = q.data?.suggestions.find((s) => s.kind === kind);
  const entries = q.data?.knowledge.filter((e) => e.scope === clientScope(kind)) ?? [];
  const content = saved?.content as { groups?: TitleGroup[]; ideas?: Idea[] } | undefined;
  const refresh = () => cache.invalidateQueries({ queryKey: ["client-tools", clientId] });
  async function run() {
    setBusy(true);
    try { await generate({ data: { clientId, kind } }); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not generate"); }
    finally { setBusy(false); }
  }
  async function teach() {
    if (!input.trim()) return;
    setTraining(true);
    try { await train({ data: { clientId, kind, input } }); setInput(""); await refresh(); toast.success("Saved for this client"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setTraining(false); }
  }
  return <section className="detail-section" aria-label={title}>
    <header className="page-header"><h2>{title}</h2>
      <Button disabled={busy} onClick={run}>{saved ? <RefreshCw /> : <Sparkles />}{busy ? "Generating…" : saved ? "Regenerate" : "Generate"}</Button>
    </header>
    {saved && <p className="caption">Generated {new Date(saved.generated_at).toLocaleString()}</p>}
    {!saved && !busy && <p>Nothing generated yet.</p>}
    {content?.groups?.map((g, i) => <div key={i} className="glass-panel" style={{ padding: 12, marginBottom: 8 }}>
      <p className="caption">Original: {g.original}</p>
      <ol>{g.titles.map((t, j) => <li key={j}>{t}</li>)}</ol>
    </div>)}
    {content?.ideas && <ol>{content.ideas.map((idea, i) => <li key={i}><strong>{idea.title}</strong><p>{idea.description}</p></li>)}</ol>}
    <h3>Train for this client</h3>
    <div className="filter-bar">
      <textarea aria-label={`${title} feedback`} placeholder={`Feedback or examples of ${kind === "TITLES" ? "titles" : "ideas"} you prefer…`} value={input} onChange={(e) => setInput(e.target.value)} />
      <Button disabled={training || !input.trim()} onClick={teach}><Send />{training ? "Saving…" : "Save feedback"}</Button>
    </div>
    {entries.map((e) => <details key={e.id}><summary>{(e.learned_principle || "").slice(0, 120)}</summary><p className="prose">{e.user_input}</p>
      <Button size="sm" variant="ghost" aria-label="Delete feedback" onClick={async () => { await remove({ data: { id: e.id } }); await refresh(); }}><Trash2 />Delete</Button></details>)}
  </section>;
}
