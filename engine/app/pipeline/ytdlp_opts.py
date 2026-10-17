"""
One place for the yt-dlp settings the link reader and the downloader share.

YouTube scores the address a request comes from. A cloud machine's address
scores badly, so a server gets asked to "sign in to confirm you're not a bot"
for a video any browser plays without a thought. Nothing here is a trick: it
is the set of things that genuinely raise a server's standing.

  - a PO token, minted on this machine by the bgutil provider in the image.
    It is the proof-of-origin a browser sends. No account, no cookies.
  - IPv4 only. YouTube judges a server's IPv6 range much more harshly.
  - a calmer request rate, so a batch of videos does not look like a scrape.
  - a proxy, when YTDLP_PROXY is set. A residential address is the one thing
    that reliably clears a blocked datacentre IP.
  - cookies, when a cookies.txt is placed on the volume. Last resort: they
    expire, and they put the account that exported them at risk.

YouTube also sets a JavaScript challenge that has to be solved before it will
hand over a video. yt-dlp solves it with a JS runtime, but only looks for Deno
unless told otherwise, so the Node in this image has to be named explicitly.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

#: Where the bgutil PO token script lives in the image.
BGUTIL_HOME = os.environ.get("BGUTIL_HOME", "/opt/bgutil/server")

#: Optional cookies file, read from the data volume so it survives a deploy.
COOKIE_FILE = Path(os.environ.get("YTDLP_COOKIES", "/data/cookies.txt"))

#: Player clients to try in turn. The first one YouTube serves wins. Different
#: clients are gated differently, so one often works where another is refused.
PLAYER_CLIENTS = ("default", "tv", "web_safari", "mweb")

#: The errors worth trying another client for.
BLOCKED_SIGNS = ("not a bot", "sign in to confirm", "login_required", "cookies")


def proxy() -> str:
    return (os.environ.get("YTDLP_PROXY") or "").strip()


def js_runtime() -> str:
    """The Node that solves YouTube's JS challenge and runs the token script."""
    return os.environ.get("NODE_PATH_BIN") or shutil.which("node") or "/usr/bin/node"


def looks_blocked(message: str) -> bool:
    m = (message or "").lower()
    return any(s in m for s in BLOCKED_SIGNS)


def _pot_arg() -> str:
    return f"youtubepot-bgutilscript:server_home={BGUTIL_HOME}"


def api_opts(player_client: str = "default") -> dict:
    """Options for the Python API, used by the link reader."""
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 20,
        "retries": 3,
        "sleep_requests": 1,
        # Bind to an IPv4 address: the same thing --force-ipv4 does.
        "source_address": "0.0.0.0",
        "extractor_args": {
            "youtubepot-bgutilscript": {"server_home": [BGUTIL_HOME]},
        },
        # Without this yt-dlp looks only for Deno and leaves the challenge
        # unsolved, which reads as another refusal.
        "js_runtimes": {"node": {"path": js_runtime()}},
    }
    if player_client != "default":
        opts["extractor_args"]["youtube"] = {"player_client": [player_client]}
    if proxy():
        opts["proxy"] = proxy()
    if COOKIE_FILE.exists():
        opts["cookiefile"] = str(COOKIE_FILE)
    return opts


def cli_args(player_client: str = "default") -> list[str]:
    """The same settings as flags, for the download subprocess."""
    args = [
        "--force-ipv4",
        "--retries", "3",
        "--sleep-requests", "1",
        "--js-runtimes", f"node:{js_runtime()}",
        "--extractor-args", _pot_arg(),
    ]
    if player_client != "default":
        args += ["--extractor-args", f"youtube:player_client={player_client}"]
    if proxy():
        args += ["--proxy", proxy()]
    if COOKIE_FILE.exists():
        args += ["--cookies", str(COOKIE_FILE)]
    return args
