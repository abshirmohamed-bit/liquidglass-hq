"""Getting a video into the Engine: uploads and link imports."""
from __future__ import annotations

import shutil
from pathlib import Path

from sqlmodel import Session

from .. import media, storage, webhooks
from ..config import settings
from ..errors import EngineError
from ..models import Asset, utcnow

VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/x-msvideo",
               "video/x-m4v", "video/mpeg", "video/x-ms-wmv", "video/x-flv", "video/3gpp"}
AUDIO_TYPES = {"audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/aac", "audio/ogg",
               "audio/webm", "audio/flac"}
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
FONT_TYPES = {"font/ttf", "font/otf", "font/woff2", "application/x-font-ttf"}
SUB_TYPES = {"application/x-subrip", "text/vtt", "text/plain"}

# page hosts the importer will resolve with yt-dlp
IMPORT_HOSTS = ("youtube.com", "youtu.be", "rumble.com", "vimeo.com", "twitch.tv", "facebook.com",
                "x.com", "twitter.com", "tiktok.com", "instagram.com", "drive.google.com",
                "dropbox.com", "zoom.us")


def kind_for(content_type: str) -> str:
    if content_type in VIDEO_TYPES:
        return "video"
    if content_type in AUDIO_TYPES:
        return "audio"
    if content_type in IMAGE_TYPES:
        return "image"
    if content_type in FONT_TYPES:
        return "font"
    if content_type in SUB_TYPES:
        return "subtitles"
    raise EngineError("UNSUPPORTED_MEDIA_TYPE", f"The Engine does not accept {content_type or 'that file type'}.")


def limit_for(kind: str) -> int:
    cfg = settings()
    return {"video": cfg.max_upload_bytes, "audio": 100 * 1024**2, "image": 20 * 1024**2,
            "font": 5 * 1024**2, "subtitles": 2 * 1024**2}[kind]


def needs_rights(url: str) -> bool:
    low = url.lower()
    return any(host in low for host in IMPORT_HOSTS)


def ingest_video(session: Session, asset: Asset, src: Path) -> Asset:
    """Probe, thumbnail and normalise. The mezzanine keeps the source resolution."""
    info = media.probe(src)
    cfg = settings()
    if info.duration_s < cfg.min_source_seconds:
        raise EngineError("VALIDATION_ERROR",
                          f"That video is {info.duration_s:.0f}s; the minimum is {cfg.min_source_seconds}s.")
    if info.duration_s > cfg.max_source_seconds:
        raise EngineError("VALIDATION_ERROR",
                          f"That video is longer than the {cfg.max_source_seconds // 3600}h limit.")

    thumb_key = f"thumbs/{asset.id}.jpg"
    media.thumbnail(src, storage.open_write(thumb_key), info.duration_s * 0.1)
    storage.put_file(storage.open_write(thumb_key), thumb_key, "image/jpeg")

    mezz_key = f"mezzanine/{asset.id}.mp4"
    if info.needs_mezzanine:
        media.make_mezzanine(src, storage.open_write(mezz_key))
        storage.put_file(storage.open_write(mezz_key), mezz_key, "video/mp4")
    else:
        dest = storage.open_write(mezz_key)
        if src.resolve() != dest.resolve():
            shutil.copy2(src, dest)
        storage.put_file(dest, mezz_key, "video/mp4")

    asset.mezzanine_key = mezz_key
    asset.thumb_key = thumb_key
    asset.length_s = round(info.duration_s, 3)
    asset.width, asset.height, asset.fps = info.width, info.height, round(info.fps, 3)
    asset.size_bytes = info.size_bytes
    asset.quality_warning = info.height < 1080
    asset.status = "ready"
    session.add(asset)
    session.commit()
    webhooks.emit("asset.imported", asset_event(asset))
    return asset


def import_url(session: Session, asset: Asset, url: str) -> Asset:
    """Direct media URL, or a page the Engine resolves with yt-dlp.

    Called by the worker, not by a request handler: this can take minutes.
    """
    try:
        return _import_url(session, asset, url)
    except Exception as e:
        mark_failed(session, asset, e)
        raise


def mark_failed(session: Session, asset: Asset, exc: Exception) -> None:
    """An import that dies leaves a row behind; say so instead of leaving it spinning."""
    asset.status = "failed"
    asset.error = (getattr(exc, "message", None) or str(exc))[:500]
    session.add(asset)
    session.commit()
    webhooks.emit("asset.failed", {"asset_id": asset.id, "error": asset.error})


def _import_url(session: Session, asset: Asset, url: str) -> Asset:
    dest = storage.open_write(f"sources/{asset.id}/download.mp4")
    if needs_rights(url):
        if not asset.rights_confirmed:
            raise EngineError("RIGHTS_REQUIRED", "Confirm you own this footage or have the rights to clip it.")
        _ytdlp(url, dest)
    else:
        _download(url, dest)
    asset.storage_key = f"sources/{asset.id}/download.mp4"
    asset.source_url = url
    return ingest_video(session, asset, dest)


def _download(url: str, dest: Path) -> None:
    import httpx

    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, follow_redirects=True, timeout=120) as r:
        if r.status_code >= 400:
            raise EngineError("VALIDATION_ERROR", f"That URL returned {r.status_code}.")
        ctype = r.headers.get("content-type", "").split(";")[0]
        if ctype and not ctype.startswith(("video/", "application/octet-stream")):
            raise EngineError("UNSUPPORTED_MEDIA_TYPE", f"That URL serves {ctype}, not a video file.")
        with dest.open("wb") as f:
            for chunk in r.iter_bytes(1 << 20):
                f.write(chunk)


def _ytdlp(url: str, dest: Path) -> None:
    """Best quality up to 2160p so a 4K source stays 4K."""
    import subprocess

    exe = shutil.which("yt-dlp")
    if not exe:
        raise EngineError("NOT_CONFIGURED", "yt-dlp is not installed, so page links cannot be resolved.")
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [exe, "--no-playlist", "--quiet", "--no-warnings",
           # Widening fallbacks: a restricted format list is common from a server.
           "-f", ("bestvideo[height<=2160]+bestaudio/best[height<=2160]/"
                  "bv*+ba/b[height<=2160]/b"),
           "--merge-output-format", "mp4", "-o", str(dest), url]
    cookies = Path("/data/cookies.txt")
    if cookies.exists():
        cmd[1:1] = ["--cookies", str(cookies)]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if proc.returncode != 0 or not dest.exists():
        err = (proc.stderr or "").strip()
        if "requested format is not available" in err.lower() or "no video formats" in err.lower():
            raise EngineError(
                "IMPORT_FAILED",
                "YouTube did not offer this server a usable video format. Download the "
                "video and upload it from the Library instead.")
        tail = err.splitlines()[-2:]
        raise EngineError("VALIDATION_ERROR", "Could not fetch that link: " + " / ".join(tail))


def asset_event(asset: Asset) -> dict:
    """The webhook shape: the fields the app reads, plus the whole asset for anyone else."""
    full = asset_payload(asset)
    return {
        "asset_id": asset.id,
        "name": asset.name,
        "url": full["url"],
        "thumbnail_url": full["thumbnail_url"],
        "length_ms": round((asset.length_s or 0) * 1000),
        "size_bytes": asset.size_bytes,
        "quality_warning": asset.quality_warning,
        "asset": full,
    }


def asset_payload(asset: Asset) -> dict:
    return {
        "id": asset.id, "name": asset.name, "type": asset.type, "category": asset.category,
        "status": asset.status,
        "url": storage.public_url(asset.mezzanine_key or asset.storage_key) if (asset.mezzanine_key or asset.storage_key) else "",
        "thumbnail_url": storage.public_url(asset.thumb_key) if asset.thumb_key else "",
        "length": asset.length_s, "width": asset.width, "height": asset.height, "fps": asset.fps,
        "size": asset.size_bytes, "quality_warning": asset.quality_warning,
        "created_at": asset.created_at.isoformat(), "error": asset.error,
    }


def advance_one() -> bool:
    """Download one asset that is waiting to be imported. Returns True if it worked on something.

    The HTTP route only records the intent; the fetch happens here so no browser
    is left holding a connection open for a 30-minute video.
    """
    from sqlmodel import select

    from ..db import session

    with session() as s:
        asset = s.exec(
            select(Asset)
            .where(Asset.status == "importing")
            .where(Asset.source_url != "")
            .order_by(Asset.created_at)
        ).first()
        if not asset:
            return False
        url = asset.source_url
        asset.status = "downloading"
        s.add(asset)
        s.commit()
        try:
            _import_url(s, asset, url)
        except Exception as e:
            mark_failed(s, asset, e)
        return True
