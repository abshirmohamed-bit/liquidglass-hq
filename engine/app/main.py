"""The crayZmundo Engine.

One service: it takes a long video and gives back finished vertical clips.
Base44 talks to it through engineClient and gets told about progress by signed
webhooks, so the app never has to sit and wait.
"""
from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import worker
from .auth import check_key, check_rate, tier_for
from .config import settings
from .db import engine
from .errors import EngineError, engine_error_handler, error_body
from .routers import assets, clips, core

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("engine")

OPEN_PATHS = {"/v1/health", "/docs", "/openapi.json", "/redoc"}
MAX_BODY = 512 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine()                      # create tables
    worker.recover_stuck()        # a deploy or a crash leaves work half done
    worker.start()
    log.info("engine ready: storage=%s transcribe=%s finder=%s",
             settings().storage_backend, settings().transcribe_provider, settings().resolve_finder())
    yield
    worker.stop()


app = FastAPI(title="crayZmundo Engine", version="0.1.0", lifespan=lifespan)
app.add_exception_handler(EngineError, engine_error_handler)


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled error")
    return JSONResponse(error_body("VALIDATION_ERROR", str(exc)[:300]), status_code=500)


@app.middleware("http")
async def gate(request: Request, call_next):
    path = request.url.path
    if path.startswith("/media/") or path in OPEN_PATHS:
        return await call_next(request)
    try:
        key = check_key(request)
        tier = tier_for(path, request.method)
        # media never travels in a JSON body; the raw upload route is exempt
        if not path.endswith("/bytes"):
            length = int(request.headers.get("content-length") or 0)
            if length > MAX_BODY:
                raise EngineError("PAYLOAD_TOO_LARGE", "Send media through the upload endpoints, not in JSON.")
        limit, remaining, reset = check_rate(key, tier)
    except EngineError as e:
        return await engine_error_handler(request, e)

    response = await call_next(request)
    response.headers["RateLimit-Limit"] = str(limit)
    response.headers["RateLimit-Remaining"] = str(remaining)
    response.headers["RateLimit-Reset"] = str(reset)
    return response


app.include_router(core.router)
app.include_router(assets.router)
app.include_router(clips.router)

# Local storage is served by this process so every media URL is public, exactly
# as the platforms need. With s3 the bucket serves them and this is unused.
settings().media_root.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(settings().media_root)), name="media")
