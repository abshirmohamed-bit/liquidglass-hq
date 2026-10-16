"""The AutoClip state machine.

queued -> transcribing -> finding -> (awaiting_confirmation) -> cutting ->
framing -> finalizing -> completed, one stage per worker pass so progress is
real rather than a spinner.
"""
from __future__ import annotations

import time
from pathlib import Path

from sqlmodel import Session, select

from .. import media, storage, webhooks
from ..config import settings
from ..db import session as db_session
from ..ids import new_id
from ..models import Asset, Job, Project, Transcript, utcnow
from . import find as finder
from . import frame as framing
from .transcribe import slice_words, transcribe

STAGE_PROGRESS = {"transcribing": 15, "finding": 40, "cutting": 60, "framing": 80, "finalizing": 95}


def create(session: Session, asset: Asset, params: dict) -> Job:
    running = session.exec(
        select(Job).where(Job.status.in_(["queued", "processing"]))  # type: ignore[attr-defined]
    ).all()
    if len(running) >= settings().concurrent_jobs:
        from ..errors import EngineError

        raise EngineError("JOB_LIMIT_REACHED", "Three jobs are already running. Wait for one to finish.")
    job = Job(id=new_id("job"), asset_id=asset.id, params=params, status="queued")
    session.add(job)
    session.commit()
    session.refresh(job)
    return job


def advance_one() -> bool:
    """Move the oldest active job on by one stage. Returns True if anything changed."""
    with db_session() as s:
        job = s.exec(
            select(Job).where(Job.status.in_(["queued", "processing"]))  # type: ignore[attr-defined]
            .order_by(Job.created_at)
        ).first()
        if not job:
            return False
        try:
            _step(s, job)
        except Exception as e:
            job.status = "failed"
            job.error = str(e)[:500]
            s.add(job)
            s.commit()
            webhooks.emit("autoclip.failed", {"autoclip_id": job.id, "error": job.error})
        return True


def _step(s: Session, job: Job) -> None:
    started = time.time()
    if job.status == "queued":
        job.status = "processing"
        job.stage = "transcribing"
        job.progress = 5
        s.add(job)
        s.commit()
        return

    asset = s.get(Asset, job.asset_id)
    if not asset:
        raise RuntimeError("the source for this job has gone")
    params = job.params or {}

    if job.stage == "transcribing":
        _ensure_transcript(s, asset, params)
        job.stage = "finding"
        job.progress = STAGE_PROGRESS["finding"]
        s.add(job)
        s.commit()
        return

    if job.stage == "finding":
        moments = _find(s, job, asset, params)
        if moments is None:          # paused, waiting for a count
            return
        job.params = {**params, "_moments": [m.__dict__ for m in moments]}
        job.stage = "cutting"
        job.progress = STAGE_PROGRESS["cutting"]
        s.add(job)
        s.commit()
        return

    if job.stage == "cutting":
        _cut(s, job, asset, params)
        job.stage = "framing"
        job.progress = STAGE_PROGRESS["framing"]
        s.add(job)
        s.commit()
        return

    if job.stage == "framing":
        _frame(s, job, asset)
        job.stage = "finalizing"
        job.progress = STAGE_PROGRESS["finalizing"]
        s.add(job)
        s.commit()
        return

    if job.stage == "finalizing":
        job.status = "completed"
        job.progress = 100
        job.processing_s = round(job.processing_s + (time.time() - started), 2)
        job.params = {k: v for k, v in (job.params or {}).items() if not k.startswith("_")}
        s.add(job)
        s.commit()
        webhooks.emit("autoclip.completed", {
            "autoclip_id": job.id,
            "source_name": _source_name(s, job),
            "processing_seconds": round(job.processing_s),
            "clips": clips_payload(s, job.id),
        })
        return


def _ensure_transcript(s: Session, asset: Asset, params: dict) -> Transcript:
    existing = s.exec(select(Transcript).where(Transcript.asset_id == asset.id)).first()
    if existing and existing.status == "ready":
        return existing
    row = existing or Transcript(id=new_id("trn"), asset_id=asset.id)
    row.status = "processing"
    s.add(row)
    s.commit()
    started = time.time()
    source = storage.local_path(asset.mezzanine_key or asset.storage_key)
    audio = source.with_suffix(".16k.wav")
    media.extract_audio(source, audio)
    result = transcribe(audio, asset.length_s, params.get("vocabulary") or [], params.get("language"))
    audio.unlink(missing_ok=True)
    words, sentences = result.as_dicts()
    row.words, row.sentences = words, sentences
    row.language, row.model = result.language, result.model
    row.status = "ready"
    row.processing_s = round(time.time() - started, 2)
    s.add(row)
    s.commit()
    webhooks.emit("transcript.completed", {"transcript_id": row.id, "asset_id": asset.id})
    return row


def _target_ms(params: dict, asset: Asset) -> int:
    length = params.get("clip_length", "auto")
    if isinstance(length, (int, float)):
        return int(length) * 1000
    if isinstance(length, dict):
        return int((length.get("min_s", 45) + length.get("max_s", 90)) / 2 * 1000)
    return 60_000


def _find(s: Session, job: Job, asset: Asset, params: dict) -> list[finder.Moment] | None:
    transcript = s.exec(select(Transcript).where(Transcript.asset_id == asset.id)).first()
    sentences = list(transcript.sentences) if transcript else []
    coverage = params.get("coverage", "best")
    target = _target_ms(params, asset)

    start_ms = int(params.get("range_start_ms") or 0)
    end_ms = int(params.get("range_end_ms") or asset.length_s * 1000)
    if start_ms or end_ms < asset.length_s * 1000:
        sentences = [x for x in sentences if x["end_ms"] > start_ms and x["start_ms"] < end_ms]

    requested = params.get("clip_count", "auto")
    if requested == "auto":
        suggested = finder.suggest_count(end_ms - start_ms, coverage, target)
        if params.get("confirm_count") and job.suggested_count is None:
            job.suggested_count = suggested
            job.status = "awaiting_confirmation"
            job.stage = ""
            job.progress = 25
            s.add(job)
            s.commit()
            webhooks.emit("autoclip.awaiting_confirmation", {
                "autoclip_id": job.id,
                "suggested_count": suggested,
                "source_name": _source_name(s, job),
            })
            return None
        count = job.suggested_count or suggested
    else:
        count = int(requested)

    envelope: list[float] = []
    if params.get("mode") == "energy" or (params.get("mode", "auto") == "auto" and not sentences):
        envelope = media.loudness_envelope(storage.local_path(asset.mezzanine_key))

    moments = finder.find(
        sentences, count=count, target_ms=target, mode=params.get("mode", "auto"),
        coverage=coverage, genre=params.get("genre", "auto"), prompt=params.get("prompt", ""),
        must_include=params.get("must_include") or [], keep_qa=params.get("keep_qa", True),
        envelope=envelope,
    )
    if coverage == "whole":
        covered = [{"start_ms": m.start_ms, "end_ms": m.end_ms} for m in moments]
        job.skipped = _gaps(covered, start_ms, end_ms)
    return moments


def _gaps(covered: list[dict], start_ms: int, end_ms: int, min_gap: int = 4000) -> list[dict]:
    out: list[dict] = []
    cursor = start_ms
    for c in sorted(covered, key=lambda x: x["start_ms"]):
        if c["start_ms"] - cursor >= min_gap:
            out.append({"start_ms": cursor, "end_ms": c["start_ms"], "kind": "dead_air"})
        cursor = max(cursor, c["end_ms"])
    if end_ms - cursor >= min_gap:
        out.append({"start_ms": cursor, "end_ms": end_ms, "kind": "outro"})
    return out


def _cut(s: Session, job: Job, asset: Asset, params: dict) -> None:
    moments = [finder.Moment(**m) for m in (job.params or {}).get("_moments", [])]
    transcript = s.exec(select(Transcript).where(Transcript.asset_id == asset.id)).first()
    words = list(transcript.words) if transcript else []
    formats = params.get("formats") or ["full-video"]
    for i, m in enumerate(moments, start=1):
        project = Project(
            id=new_id("prj"), asset_id=asset.id, job_id=job.id, index=i,
            in_ms=m.start_ms, out_ms=m.end_ms,
            aspect=params.get("aspect", "9:16"), layout=formats[0],
            caption_style_id=params.get("caption_style_id") or "bold_white",
            caption_options={"enabled": params.get("edit_level", "full") != "clips"},
            framing={"mode": params.get("framing", "auto")},
            edits=params.get("edits") or {},
            score=m.score, grades=m.grades, scene_analysis=m.scene_analysis, reason=m.reason,
            title={"text": m.title, "style": "bold_band",
                   "auto": bool(params.get("headline_top_n", 0) and i <= int(params.get("headline_top_n", 0)))},
            captions=slice_words(words, m.start_ms, m.end_ms),
        )
        s.add(project)
    s.commit()


def _frame(s: Session, job: Job, asset: Asset) -> None:
    """One thumbnail per clip, plus the faces the tracker saw."""
    source = storage.local_path(asset.mezzanine_key)
    projects = s.exec(select(Project).where(Project.job_id == job.id)).all()
    for p in projects:
        mid_s = (p.in_ms + (p.out_ms - p.in_ms) / 2) / 1000
        key = f"thumbs/{p.id}.jpg"
        try:
            media.thumbnail(source, storage.open_write(key), mid_s, width=540)
            storage.put_file(storage.open_write(key), key, "image/jpeg")
            p.thumb_key = key
        except Exception:
            p.thumb_key = asset.thumb_key
        s.add(p)
    s.commit()


def _source_name(s: Session, job: Job) -> str:
    """What the creator will see named in the notification."""
    asset = s.get(Asset, job.asset_id)
    return (asset.name if asset else "") or "your video"


def clips_payload(s: Session, job_id: str) -> list[dict]:
    projects = s.exec(select(Project).where(Project.job_id == job_id).order_by(Project.index)).all()
    return [project_summary(p) for p in projects]


def project_summary(p: Project) -> dict:
    return {
        "project_id": p.id, "index": p.index, "title": (p.title or {}).get("text", ""),
        "start_ms": p.in_ms, "end_ms": p.out_ms, "duration_ms": p.out_ms - p.in_ms,
        "thumbnail_url": storage.public_url(p.thumb_key) if p.thumb_key else "",
        "score": p.score, "grades": p.grades, "scene_analysis": p.scene_analysis,
        "reason": p.reason, "alternate_of": p.alternate_of or None,
        "faces": p.faces or [],
    }
