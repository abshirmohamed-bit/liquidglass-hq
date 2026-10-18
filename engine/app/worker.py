"""A background loop that advances queued work.

Deliberately not Redis/RQ: one process, one SQLite file and a thread keeps the
whole Engine to a single container on a small host. Swap in a real queue only
when more than one worker machine is needed.
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Callable

log = logging.getLogger("engine.worker")

_stop = threading.Event()
_thread: threading.Thread | None = None


def tick() -> int:
    """One pass over everything that might have work. Returns items advanced."""
    from . import webhooks
    from .pipeline import exports as export_pipeline
    from .pipeline import ingest as ingest_pipeline
    from .pipeline import jobs as job_pipeline

    done = 0
    for step in (ingest_pipeline.advance_one, job_pipeline.advance_one, export_pipeline.advance_one):
        try:
            done += 1 if step() else 0
        except Exception:
            log.exception("worker step failed")
    try:
        webhooks.deliver_due()
    except Exception:
        log.exception("webhook delivery failed")
    return done


def _loop(interval: float) -> None:
    while not _stop.is_set():
        try:
            busy = tick()
        except Exception:
            log.exception("worker tick failed")
            busy = 0
        _stop.wait(0.1 if busy else interval)


def start(interval: float = 1.0) -> None:
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, args=(interval,), daemon=True, name="engine-worker")
    _thread.start()


def stop(timeout: float | None = None) -> None:
    """Ask the loop to finish what it is doing, then wait for it.

    A render takes tens of seconds. Giving it five was enough to kill one
    mid-frame on every deploy and leave the export stuck in "processing".
    """
    from .config import settings

    _stop.set()
    if _thread:
        _thread.join(timeout=timeout if timeout is not None else settings().shutdown_grace_s)
        if _thread.is_alive():
            log.warning("worker did not finish in time; in-flight work will be retried on boot")


def recover_stuck() -> int:
    """Put work that was interrupted back in the queue.

    A machine can vanish mid-render — a deploy, a host migration, an out-of-
    memory kill. Whatever was "processing" belongs to nobody once the process
    is gone, so on boot it goes back to "queued" rather than hanging forever.
    """
    from sqlmodel import select

    from .db import session
    from .models import Asset, Export, Job

    moved = 0
    with session() as s:
        for model in (Job, Export):
            for row in s.exec(select(model).where(model.status == "processing")).all():
                row.status = "queued"
                row.progress = 0
                s.add(row)
                moved += 1
        for asset in s.exec(select(Asset).where(Asset.status == "downloading")).all():
            asset.status = "importing"
            s.add(asset)
            moved += 1
        if moved:
            s.commit()
    if moved:
        log.info("requeued %d item(s) interrupted by the last shutdown", moved)
    return moved


def drain(max_passes: int = 200, sleep: float = 0.01, until: Callable[[], bool] | None = None) -> int:
    """Run the loop synchronously until there is nothing left. Used by tests."""
    passes = 0
    while passes < max_passes:
        advanced = tick()
        passes += 1
        if until and until():
            break
        if not advanced:
            break
        time.sleep(sleep)
    return passes
