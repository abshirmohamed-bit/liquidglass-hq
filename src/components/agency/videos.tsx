import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Clapperboard, Scissors, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingGrid } from "./kit";
import { NewJob } from "./newjob";
import { Review } from "./review";
import { reviewData } from "@/lib/review.functions";
import { renameItem, trashItem } from "@/lib/library.functions";

/**
 * Videos — the one place the day's work happens.
 *
 * Bringing a video in, watching it get clipped, approving the clips and
 * sending them out used to be three destinations. They are one screen now,
 * organised the way the work actually is: by the video it came from.
 */

type Data = Awaited<ReturnType<typeof reviewData>>;
type Source = Data["sources"][number];
type Clip = Data["clips"][number];
type Job = Data["jobs"][number];

const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");

const mmss = (ms: number | null | undefined) => {
  const s = Math.max(0, Math.round((ms ?? 0) / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
};
const mb = (bytes: number | null | undefined) =>
  bytes ? `${Math.round(bytes / 1_000_000)} MB` : null;

/** One line saying where this video has got to, in the order things happen. */
function state(src: Source, jobs: Job[], clips: Clip[]): { text: string; tone: string } {
  if (src.status === "FAILED") return { text: src.error || "Import failed", tone: "tone-red" };
  if (src.status !== "READY") return { text: "Importing", tone: "tone-orange" };

  const live = jobs.find((j) =>
    ["QUEUED", "PROCESSING", "AWAITING_CONFIRMATION"].includes(j.status),
  );
  if (live) return { text: "Finding clips", tone: "tone-blue" };

  if (!clips.length) return { text: jobs.length ? "No clips found" : "Ready to clip", tone: "" };

  const ready = clips.filter((c) => c.status === "READY").length;
  const approved = clips.filter((c) => c.status === "APPROVED").length;
  const found = clips.filter((c) => c.status === "FOUND").length;
  if (found) return { text: `${found} to review`, tone: "tone-blue" };
  if (approved) return { text: `${approved} to export`, tone: "tone-orange" };
  if (ready) return { text: `${ready} ready to post`, tone: "tone-green" };
  return { text: `${clips.length} clips`, tone: "" };
}

export function Videos({ video }: { video?: string | undefined }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["review"],
    queryFn: () => reviewData(),
    refetchInterval: (x) =>
      x.state.data?.sources.some((s) => s.status !== "READY" && s.status !== "FAILED") ||
      x.state.data?.clips.some((c) => c.status === "EXPORTING")
        ? 5000
        : false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["review"] });
  const d = q.data;

  const videos = useMemo(() => {
    if (!d) return [];
    return [...d.sources]
      .map((s) => ({
        src: s,
        jobs: d.jobs.filter((j) => j.source_asset_id === s.id),
        clips: d.clips.filter((c) => c.source_asset_id === s.id),
      }))
      .sort((a, b) => String(b.src.created_at ?? "").localeCompare(String(a.src.created_at ?? "")));
  }, [d]);

  const open = video ? videos.find((v) => v.src.id === video) : undefined;
  if (video && open) return <OneVideo v={open} refresh={refresh} />;

  return (
    <div className="page">
      <header className="page-header">
        <div className="min-w-0">
          <h1>Videos</h1>
          <p className="page-subtitle">Paste a link, and watch it become clips you can post.</p>
        </div>
      </header>

      <NewJob />

      {q.isLoading ? (
        <LoadingGrid count={6} className="lib-grid" height={210} />
      ) : !videos.length ? (
        <section className="glass-panel">
          <EmptyState
            icon={Clapperboard}
            title="No videos yet"
            hint="Paste a YouTube link above, or upload a file, and the clips will appear here."
          />
        </section>
      ) : (
        <div className="lib-grid video-grid">
          {videos.map((v) => {
            const s = state(v.src, v.jobs, v.clips);
            return (
              <Link
                key={v.src.id}
                to="/videos"
                search={{ v: v.src.id }}
                className="glass-panel video-card"
                aria-label={v.src.name}
              >
                <div className="video-thumb">
                  {v.src.thumbnail_url ? (
                    <img src={v.src.thumbnail_url} alt="" />
                  ) : (
                    <Clapperboard />
                  )}
                </div>
                <strong className="video-name">{v.src.name}</strong>
                <span className="caption muted">
                  {[
                    mmss(v.src.duration_ms),
                    v.src.height ? `${v.src.height}p` : null,
                    mb(v.src.size_bytes),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className={`status-pill ${s.tone}`}>{s.text}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** One video: what it is, what you can do to it, and every clip from it. */
function OneVideo({
  v,
  refresh,
}: {
  v: { src: Source; jobs: Job[]; clips: Clip[] };
  refresh: () => Promise<void> | void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(v.src.name);
  const s = state(v.src, v.jobs, v.clips);

  return (
    <div className="page">
      <Link to="/videos" search={{ v: undefined }} className="caption muted video-back">
        <ArrowLeft size={14} /> All videos
      </Link>

      <header className="page-header video-head">
        <div className="video-thumb is-wide">
          {v.src.thumbnail_url ? <img src={v.src.thumbnail_url} alt="" /> : <Clapperboard />}
        </div>
        <div className="min-w-0">
          {renaming ? (
            <div className="filter-bar" style={{ marginBottom: 0 }}>
              <input
                aria-label="Video name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!name.trim()}
                onClick={async () => {
                  try {
                    await renameItem({
                      data: { id: v.src.id, table: "source_assets", name: name.trim() },
                    });
                    setRenaming(false);
                    await refresh();
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setName(v.src.name);
                  setRenaming(false);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <h1>{v.src.name}</h1>
          )}
          <p className="page-subtitle">
            {[
              mmss(v.src.duration_ms),
              v.src.height ? `${v.src.height}p` : null,
              mb(v.src.size_bytes),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <span className={`status-pill ${s.tone}`}>{s.text}</span>
        </div>
        <div className="actions">
          <Button asChild size="sm">
            <Link to="/clips" search={{ source: v.src.id }}>
              <Scissors size={14} />
              Make more clips
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRenaming(true)}>
            <Pencil size={14} />
            Rename
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              try {
                await trashItem({ data: { id: v.src.id, table: "source_assets" } });
                toast.success("Moved to Trash");
                await refresh();
              } catch (e) {
                err(e);
              }
            }}
          >
            <Trash2 size={14} />
            Move to Trash
          </Button>
        </div>
      </header>

      {v.clips.length ? (
        <Review source={v.src.id} embedded />
      ) : (
        <section className="glass-panel">
          <EmptyState
            icon={Scissors}
            title={
              v.jobs.length ? "No clips from this video yet" : "Nothing clipped from this video yet"
            }
            hint={
              v.jobs.length
                ? "The last run found nothing worth cutting. Try again with a different clip length or a prompt."
                : "Run the AI over it and its clips will appear right here."
            }
            action={
              <Button asChild size="sm">
                <Link to="/clips" search={{ source: v.src.id }}>
                  Make clips
                </Link>
              </Button>
            }
          />
        </section>
      )}
    </div>
  );
}
