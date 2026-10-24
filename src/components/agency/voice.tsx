import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyBriefs, saveCopyBriefs } from "@/lib/clip.functions";

/**
 * How the AI should write, said once.
 *
 * The AI reads each clip and writes that clip's own headline and description
 * from what is actually said in it — nobody types the words. What belongs
 * here is the KIND of line to write, which is the part that is the same
 * every time and worth saying only once.
 */
export function CopyVoice() {
  const saved = useQuery({ queryKey: ["copy-briefs"], queryFn: () => copyBriefs() });
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!saved.data || loaded) return;
    setTitle(saved.data.title);
    setCaption(saved.data.caption);
    setLoaded(true);
  }, [saved.data, loaded]);

  async function save() {
    setBusy(true);
    try {
      await saveCopyBriefs({ data: { title, caption } });
      await saved.refetch();
      toast.success("Saved — new clips will be written this way");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="detail-section">
      <div className="section-toolbar">
        <h2>How the AI writes</h2>
        <div className="actions">
          <Button size="sm" onClick={save} disabled={busy || !loaded}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </div>
      <p className="caption">
        Every headline and description is written by the AI from what its own clip says, to
        earn the half second before someone scrolls past. Say here what kind of line you want
        and it applies to every clip — leave them blank for the default.
      </p>
      <label className="field">
        <span>Headlines on the video</span>
        <textarea
          rows={2}
          value={title}
          maxLength={300}
          placeholder="e.g. phrase it as a question the clip answers — respectful, never hype"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="field">
        <span>Descriptions on the post</span>
        <textarea
          rows={2}
          value={caption}
          maxLength={300}
          placeholder="e.g. hook on the first line, one line of context, hashtags last"
          onChange={(e) => setCaption(e.target.value)}
        />
      </label>
    </section>
  );
}
