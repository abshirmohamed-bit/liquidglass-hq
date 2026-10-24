"""Deciding where the 9:16 window sits, frame by frame.

Three strategies, best available wins:
  yunet  — OpenCV's face detector (needs the .onnx; the Dockerfile fetches it)
  haar   — the classic cascade, when the build ships it
  motion — frame differencing; no model weights at all, so it always works

The output is the same in every case: a list of (time, centre_x) samples that
become an ffmpeg sendcmd script, so the crop pans smoothly instead of jumping.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

SAMPLE_MS = 500
EMA_ALPHA = 0.35
#: How far the subject may drift from the middle of the window before the pan
#: stops easing and simply keeps up. Measured as a share of the SOURCE width,
#: and sized against the 9:16 window, which is about a third of a 16:9 frame:
#: 0.05 of the source is roughly 15% off centre inside the window. Smoothing
#: is there to stop jitter, not to let someone walk out of their own clip.
MAX_DRIFT = 0.05


@dataclass
class Face:
    id: int
    x: float          # centre, 0..1 of width
    y: float
    w: float
    h: float
    share: float = 0.0


@dataclass
class Track:
    strategy: str
    width: int
    height: int
    samples: list[tuple[int, float]]      # (ms, centre_x as 0..1)
    faces: list[Face]

    def centre_at(self, ms: int) -> float:
        if not self.samples:
            return 0.5
        best = min(self.samples, key=lambda s: abs(s[0] - ms))
        return best[1]


def _detector():
    """Returns (name, callable(frame) -> list of (x,y,w,h) in pixels) or (None, None)."""
    import cv2

    model = os.environ.get("FACE_MODEL_PATH", "/models/face_detection_yunet.onnx")
    if hasattr(cv2, "FaceDetectorYN") and Path(model).exists():
        det = cv2.FaceDetectorYN.create(model, "", (320, 320), 0.6, 0.3, 5000)

        def run_yunet(frame):
            h, w = frame.shape[:2]
            det.setInputSize((w, h))
            _, faces = det.detect(frame)
            return [tuple(map(float, f[:4])) for f in (faces if faces is not None else [])]

        return "yunet", run_yunet

    try:
        cascade_path = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
        if cascade_path.exists():
            cascade = cv2.CascadeClassifier(str(cascade_path))
            if not cascade.empty():
                def run_haar(frame):
                    grey = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    return [tuple(map(float, r)) for r in cascade.detectMultiScale(grey, 1.2, 5, minSize=(48, 48))]

                return "haar", run_haar
    except Exception:
        pass
    return None, None


def track(video: Path, *, mode: str = "auto", sample_ms: int = SAMPLE_MS,
          in_ms: int = 0, out_ms: int | None = None) -> Track:
    """Walk the clip and work out where the subject is over time."""
    if out_ms is not None:
        from tempfile import TemporaryDirectory
        from .. import media
        info = media.probe(video)
        # Decode only the selected range, not the full retained AV1 source.
        with TemporaryDirectory(prefix="tracking-") as directory:
            proxy = Path(directory) / "proxy.mp4"
            media.ffmpeg([
                "-ss", f"{in_ms / 1000:.3f}", "-t", f"{max(1, out_ms - in_ms) / 1000:.3f}",
                "-i", str(video), "-an", "-vf", "scale=480:-2,fps=4",
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", str(proxy),
            ], timeout=300)
            result = track(proxy, mode=mode, sample_ms=sample_ms)
        return Track(result.strategy, info.width, info.height,
                     [(ms + in_ms, x) for ms, x in result.samples], result.faces)
    import cv2
    import numpy as np

    from ..config import settings
    threads = settings().worker_threads()
    cv2.setNumThreads(threads)
    cap = cv2.VideoCapture(str(video), cv2.CAP_FFMPEG, [cv2.CAP_PROP_N_THREADS, threads])
    if not cap.isOpened():
        return Track("none", 0, 0, [], [])
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 1
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    _ = total  # frame count is informational; the walk below ends at EOF

    name, detect = (None, None) if mode == "center" else _detector()
    strategy = name or ("center" if mode == "center" else "motion")

    raw: list[tuple[int, float]] = []
    boxes: list[tuple[int, tuple[float, float, float, float]]] = []
    # (ms, [(centre_x, width) for every face seen]) — what the crop needs in
    # order to decide between holding everyone and choosing one.
    spread: list[tuple[int, list[tuple[float, float]]]] = []
    prev_grey = None
    # Walk the file in order and keep every Nth frame. Seeking per sample with
    # CAP_PROP_POS_MSEC hands back the same frame on many builds and codecs,
    # which silently made every diff zero and every clip a centre crop.
    step = max(1, int(round(fps * sample_ms / 1000)))
    index = -1
    while True:
        if not cap.grab():
            break
        index += 1
        if index % step:
            continue
        ok, frame = cap.retrieve()
        if not ok:
            break
        ms = int(index / fps * 1000) if fps else index
        # work on a small proxy: detection does not need full resolution
        scale = 480 / max(1, frame.shape[1])
        small = cv2.resize(frame, (0, 0), fx=scale, fy=scale) if scale < 1 else frame

        centre = None
        if detect:
            found = detect(small)
            if found:
                sw_, sh_ = small.shape[1], small.shape[0]
                norm = [((x + w / 2) / sw_, (y + h / 2) / sh_, w / sw_, h / sh_) for x, y, w, h in found]
                # Every face counts: an interview has two, and holding only the
                # larger one swings the crop away from whoever is answering.
                for box in norm:
                    boxes.append((ms, box))
                spread.append((ms, [(b[0], b[2]) for b in norm]))
                centre = sum(b[0] for b in norm) / len(norm)
        if centre is None and strategy == "motion":
            grey = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            if prev_grey is not None and prev_grey.shape == grey.shape:
                diff = cv2.absdiff(grey, prev_grey)
                columns = diff.sum(axis=0).astype("float64")
                if columns.sum() > grey.size * 0.4:     # ignore a near-static frame
                    idx = np.arange(columns.size)
                    centre = float((columns * idx).sum() / columns.sum()) / columns.size
            prev_grey = grey
        if centre is not None:
            raw.append((ms, min(1.0, max(0.0, centre))))
    cap.release()

    smoothed = _smooth(_aim(spread, raw))
    return Track(strategy, width, height, smoothed, _faces_from(boxes))


#: How much of a 16:9 frame a 9:16 window covers. Faces spread wider than
#: this cannot all be held, and something has to be chosen.
WINDOW_SHARE = 9 / 16 / (16 / 9)


def _aim(spread: list[tuple[int, list[tuple[float, float]]]],
         fallback: list[tuple[int, float]]) -> list[tuple[int, float]]:
    """Where to point the crop at each moment.

    One face: that face. Several: hold them all when the window is wide
    enough, and otherwise follow the biggest — the person nearest the camera,
    who is almost always the one talking. Splitting the difference between two
    faces that cannot both fit frames neither of them, which is the single
    ugliest thing an auto-crop does.
    """
    if not spread:
        return fallback
    out: list[tuple[int, float]] = []
    for ms, faces in spread:
        if len(faces) == 1:
            out.append((ms, faces[0][0]))
            continue
        lo = min(c - w / 2 for c, w in faces)
        hi = max(c + w / 2 for c, w in faces)
        if hi - lo <= WINDOW_SHARE:
            out.append((ms, (lo + hi) / 2))
        else:
            biggest = max(faces, key=lambda f: f[1])
            out.append((ms, biggest[0]))
    return out


def _smooth(raw: list[tuple[int, float]], alpha: float = EMA_ALPHA,
            max_drift: float = MAX_DRIFT) -> list[tuple[int, float]]:
    """An exponential moving average, on a leash.

    The average alone makes the window drift rather than snap, which is what
    makes a pan watchable. On its own it also lets a subject who moves quickly
    outrun the window and leave the frame, so the result is clamped: the
    window may lag, but never by more than `max_drift` of the width.
    """
    out: list[tuple[int, float]] = []
    value: float | None = None
    for ms, x in raw:
        value = x if value is None else value + alpha * (x - value)
        value = min(x + max_drift, max(x - max_drift, value))
        out.append((ms, round(value, 4)))
    return out


def _faces_from(boxes: list[tuple[int, tuple[float, float, float, float]]]) -> list[Face]:
    """Cluster detections into a handful of faces so the app can show who it found."""
    faces: list[Face] = []
    counts: list[int] = []
    for _, (x, y, w, h) in boxes:
        hit = next((i for i, f in enumerate(faces) if abs(f.x - x) < 0.12), None)
        if hit is None:
            faces.append(Face(id=len(faces) + 1, x=x, y=y, w=w, h=h))
            counts.append(1)
        else:
            counts[hit] += 1
            f = faces[hit]
            n = counts[hit]
            f.x = (f.x * (n - 1) + x) / n
            f.y = (f.y * (n - 1) + y) / n
    total = sum(counts) or 1
    for f, c in zip(faces, counts):
        f.share = round(c / total, 3)
    return sorted(faces, key=lambda f: -f.share)[:4]


#: A face has to be on screen this much of the time to count as someone the
#: clip is about, rather than a passer-by or a false positive.
MIN_SHARE = 0.18
#: And this far from anyone already counted, as a share of the width. Faces
#: closer than this are one person the detector saw twice, or two people close
#: enough that a single crop holds both.
MIN_GAP = 0.15


def people(track: Track, *, min_share: float = MIN_SHARE,
           min_gap: float = MIN_GAP, limit: int = 2) -> list[Face]:
    """The distinct speakers in the clip, most present first.

    `track.faces` is every cluster the detector produced, including fleeting
    ones. This is the subset worth building a layout around.
    """
    out: list[Face] = []
    for f in track.faces:
        if f.share < min_share:
            continue
        if any(abs(f.x - g.x) < min_gap for g in out):
            continue
        out.append(f)
        if len(out) == limit:
            break
    return out


def suggest_layout(track: Track | None) -> str:
    """Which layout the faces call for.

    A split is for people a single window cannot hold. Two faces closer
    together than the window is wide already fit in one tracked crop, and
    stacking them there would zoom into two halves of the same shot. Further
    apart than that, holding both means framing the gap between them — the
    shot of the backs of two heads — so stack them instead.
    """
    if track is None or not track.faces:
        return "full-video"
    who = people(track)
    if len(who) < 2:
        return "full-video"
    spread = max(f.x for f in who) - min(f.x for f in who)
    return "split" if spread > WINDOW_SHARE else "full-video"


#: How much of a cell's width a face should fill. Faces are cropped to this
#: rather than to the widest box that fits, which leaves the subject a speck
#: in the middle of the cell.
FACE_SHARE = 0.20
#: Keep this much of the frame between a crop's edge and the next person's
#: face, so a cell never shows a slice of someone else.
FACE_MARGIN = 0.02


def cell_crops(track: Track, out_w: int, out_h: int, rows: int = 2) -> list[str]:
    """One crop per person, each the shape of its cell in a stack of `rows`.

    Every cell is framed on its own face and fenced off from the neighbouring
    one, so the subject fills the cell and nobody appears twice. Returns
    ffmpeg crop filters top first, or nothing when the faces do not support a
    split and the caller should fall back.
    """
    sw, sh = track.width, track.height
    if not sw or not sh or rows < 1:
        return []
    who = people(track, limit=rows)
    if len(who) < rows:
        return []
    who = sorted(who, key=lambda f: f.x)      # left-hand speaker on top
    target = out_w / (out_h / rows)
    crops = []
    for i, f in enumerate(who):
        # The band this cell may draw from: up to the next person's face, so a
        # shoulder can show but a second head cannot.
        lo = 0.0 if i == 0 else (who[i - 1].x + who[i - 1].w / 2 + FACE_MARGIN) * sw
        hi = float(sw) if i == len(who) - 1 else (f.x + (who[i + 1].x - f.x) / 2) * sw
        hi = min(float(sw), max(hi, lo + 2))
        cw = min(hi - lo, float(sw), max(f.w * sw / FACE_SHARE, 16.0))
        ch = cw / target
        if ch > sh:                            # too tall for the source: fit height
            ch = float(sh)
            cw = ch * target
        cw = max(2, int(cw) - int(cw) % 2)
        ch = max(2, int(ch) - int(ch) % 2)
        x = int(round(f.x * sw - cw / 2))
        x = max(int(lo), min(int(hi) - cw, x))
        x = max(0, min(sw - cw, x))
        # Aim a little above the face centre: a head sits better high in frame
        # than dead centre, and it leaves room for the shoulders.
        y = int(round((f.y - f.h * 0.15) * sh - ch / 2))
        y = max(0, min(sh - ch, y))
        crops.append(f"crop={cw}:{ch}:{x}:{y}")
    return crops


def crop_filter(track: Track, out_w: int, out_h: int, duration_ms: int,
                name: str = "subject") -> tuple[str, str | None]:
    """An ffmpeg crop that follows the subject.

    Returns (filter string, sendcmd file contents). The crop box is the largest
    one of the target shape that fits the source, panned horizontally over time.

    The filter is named, because sendcmd addresses filters by name and a graph
    can hold more than one crop. Unnamed, the pan lands on whichever crop
    ffmpeg sees first.
    """
    sw, sh = track.width or out_w, track.height or out_h
    target = out_w / out_h
    if sw / sh > target:                      # wider than the target: crop sides
        cw, ch = int(sh * target), sh
    else:                                     # taller: crop top and bottom
        cw, ch = sw, int(sw / target)
    cw -= cw % 2
    ch -= ch % 2
    max_x = max(0, sw - cw)
    y = max(0, (sh - ch) // 2)

    if not track.samples or max_x == 0:
        x = max_x // 2
        return f"crop@{name}={cw}:{ch}:{x}:{y}", None

    commands = []
    for ms, centre in track.samples:
        x = int(round(centre * sw - cw / 2))
        x = max(0, min(max_x, x))
        commands.append(f"{ms / 1000:.2f} crop@{name} x {x};")
    first = int(round(track.samples[0][1] * sw - cw / 2))
    first = max(0, min(max_x, first))
    return f"crop@{name}={cw}:{ch}:{first}:{y}", "\n".join(commands)
