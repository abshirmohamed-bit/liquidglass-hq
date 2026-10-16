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
    from .pipeline import jobs as job_pipeline

    done = 0
    for step in (job_pipeline.advance_one, export_pipeline.advance_one):
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


def stop(timeout: float = 5.0) -> None:
    _stop.set()
    if _thread:
        _thread.join(timeout=timeout)


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
