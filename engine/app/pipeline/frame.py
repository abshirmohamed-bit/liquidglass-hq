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
EMA_ALPHA = 0.2


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


def track(video: Path, *, mode: str = "auto", sample_ms: int = SAMPLE_MS) -> Track:
    """Walk the clip and work out where the subject is over time."""
    import cv2
    import numpy as np

    cap = cv2.VideoCapture(str(video))
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
                x, y, w, h = max(found, key=lambda f: f[2] * f[3])
                centre = (x + w / 2) / small.shape[1]
                boxes.append((ms, ((x + w / 2) / small.shape[1], (y + h / 2) / small.shape[0],
                                   w / small.shape[1], h / small.shape[0])))
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

    smoothed = _smooth(raw)
    return Track(strategy, width, height, smoothed, _faces_from(boxes))


def _smooth(raw: list[tuple[int, float]], alpha: float = EMA_ALPHA) -> list[tuple[int, float]]:
    """An exponential moving average: the window drifts, it never snaps."""
    out: list[tuple[int, float]] = []
    value: float | None = None
    for ms, x in raw:
        value = x if value is None else value + alpha * (x - value)
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


def crop_filter(track: Track, out_w: int, out_h: int, duration_ms: int) -> tuple[str, str | None]:
    """An ffmpeg crop that follows the subject.

    Returns (filter string, sendcmd file contents). The crop box is the largest
    one of the target shape that fits the source, panned horizontally over time.
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
        return f"crop={cw}:{ch}:{x}:{y}", None

    commands = []
    for ms, centre in track.samples:
        x = int(round(centre * sw - cw / 2))
        x = max(0, min(max_x, x))
        commands.append(f"{ms / 1000:.2f} crop x {x};")
    first = int(round(track.samples[0][1] * sw - cw / 2))
    first = max(0, min(max_x, first))
    return f"crop={cw}:{ch}:{first}:{y}", "\n".join(commands)
