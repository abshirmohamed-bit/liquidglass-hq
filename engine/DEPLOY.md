# Deploying the crayZmundo Engine to Fly.io

The Engine is the part of crayZmundo that actually cuts video. It needs ffmpeg,
real CPU and jobs that run for tens of seconds, which is why it runs as its own
container rather than on the web host.

Everything below is run from `engine/`.

---

## Before you start

```bash
# install flyctl (macOS/Linux)
curl -L https://fly.io/install.sh | sh
# Windows PowerShell
#   pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"

fly auth signup   # or: fly auth login
```

---

## 1. Create the app

`fly.toml` is already written. Pick your own app name — it becomes part of the
URL — and edit the first line of `fly.toml` to match.

```bash
fly apps create crayzmundo-engine        # use your chosen name
fly config validate --strict             # catches typos; default validation ignores unknown keys
```

## 2. Create the volume

Holds the database, the Whisper weights and any locally-stored media. It lives
in the same region as the app.

```bash
fly volumes create crayz_data --region syd --size 10
```

## 3. Create object storage for the finished clips

Rendered clips must be served to the app and the browser, so they belong in
object storage rather than on the machine's disk. Fly's Tigris is
S3-compatible and the Engine picks it up with no extra configuration.

```bash
fly storage create --public -a crayzmundo-engine
```

This sets `BUCKET_NAME`, `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` as secrets. **Save the keys when they are printed —
flyctl cannot show them again.** The Engine reads those names directly and
switches itself from local disk to object storage.

Public URLs then look like `https://<bucket>.t3.tigrisfiles.io/<key>`. Tell the
Engine that base so the links it hands the app are the public ones:

```bash
fly secrets set S3_PUBLIC_BASE_URL="https://<your-bucket>.t3.tigrisfiles.io" -a crayzmundo-engine
```

## 4. Set the secrets

Generate the key and the webhook secret:

```bash
make keygen
```

Then set them. `WEBHOOK_URL` points back at your crayZmundo site.

```bash
fly secrets set \
  ENGINE_API_KEYS="<the ENGINE_API_KEYS value from keygen>" \
  WEBHOOK_SECRET="<the WEBHOOK_SECRET value from keygen>" \
  WEBHOOK_URL="https://crayzmundo.com/api/public/hooks/engine" \
  PUBLIC_BASE_URL="https://crayzmundo-engine.fly.dev" \
  -a crayzmundo-engine
```

Optional — without it the Engine finds moments with its own transcript rules
instead of Claude, which works but is less smart:

```bash
fly secrets set ANTHROPIC_API_KEY="sk-ant-..." -a crayzmundo-engine
```

## 5. Deploy

```bash
fly deploy
```

First boot downloads the Whisper model onto the volume, so it takes a few
minutes. Later deploys reuse it.

## 6. Check it

```bash
fly status
curl -s https://crayzmundo-engine.fly.dev/v1/health | jq
```

A healthy response names the providers actually in use:

```json
{"success": true, "status": "ok", "ffmpeg": true,
 "storage_backend": "s3", "transcribe_provider": "faster-whisper", "finder": "claude"}
```

If `finder` says `rules`, the Anthropic key is not set. If `storage_backend`
says `local`, the bucket secrets did not land.

## 7. Point crayZmundo at it

In the app's own secrets (Lovable → Secrets), set:

| Name | Value |
| --- | --- |
| `ENGINE_URL` | `https://crayzmundo-engine.fly.dev` |
| `ENGINE_API_KEY` | the same value as `ENGINE_API_KEYS` |
| `ENGINE_WEBHOOK_SECRET` | the same value as `WEBHOOK_SECRET` |

`ENGINE_URL` can also be stored in the `app_settings` table under the key
`ENGINE_URL`; the environment variable wins when both are present.

Then press **Send test event** on the Settings → Engine card. A 200 means the
signature matches and the two halves are talking.

---

## Things that will bite you if changed

**`auto_stop_machines = "off"` must stay off.** Fly's proxy only sees inbound
HTTP. It cannot see a render in progress, so with autostop on, Fly would stop
the machine mid-encode and the export would never finish. The Engine puts
itself to sleep instead — see "Paying only for the hours you use" below.

**`[[restart]] policy = "on-failure"` must stay that way.** The Engine shuts
itself down with a clean exit when idle. `policy = "always"` would restart it
within seconds and the machine would never actually sleep.

**`kill_timeout = "300s"` must stay above `SHUTDOWN_GRACE_S` (120s).** On
deploy, Fly sends SIGTERM; the Engine stops taking new work and lets the
current render finish. If the timeout is shorter than the render, Fly sends
SIGKILL and the work is lost. Anything interrupted anyway is put back in the
queue on the next boot, so nothing hangs in "processing" forever.

**These are top-level keys in `fly.toml`.** In TOML, a key written after a
`[table]` header belongs to that table. Keep `kill_signal` and `kill_timeout`
above the first `[section]` or Fly silently ignores them.

---

## Running it

```bash
fly logs                       # live
fly ssh console                # a shell on the machine
fly scale show                 # what you are paying for
fly scale vm performance-4x    # renders feel slow
fly volumes extend <id> -s 25  # running out of disk
```

**Cost.** The machine is the bulk of the bill, plus Tigris storage and egress.
Fly bills the machine per second that it runs, so what you pay depends far
more on whether it sleeps than on how big it is — see below. Check Fly's
current pricing before committing.

## Paying only for the hours you use

Left alone, a Fly machine runs every second of the month whether anyone uses
it or not. The Engine instead stops itself once it has been quiet, and Fly's
proxy starts it again the next time the app calls it. A machine used an hour a
day is billed for an hour a day.

```bash
fly machine list               # "stopped" is the state you want when idle
fly logs                       # look for: sleeping: idle for 604s ...
```

Three settings make it work, and all three are already in `fly.toml`:

| setting | value | why |
| --- | --- | --- |
| `IDLE_SHUTDOWN_S` | `600` | quiet minutes before sleeping; `0` runs it 24/7 |
| `auto_start_machines` | `true` | the next request wakes it |
| `min_machines_running` | `0` | nothing to wake up if Fly keeps one running |

**It will not sleep on top of your work.** The decision is made by the Engine,
not by Fly, precisely because Fly cannot see a render. `app/idle.py` refuses to
sleep while any job, import or export is queued or processing, while an asset
is still importing, or while a finished clip still owes the app a webhook.
A job parked at `awaiting_confirmation` is the one exception: that waits on a
person, who may not come back for days.

**What you will notice.** The first call after a sleep waits a few seconds for
the machine to boot. `engineClient` in the app expects this and retries a
refused connection or a 503 three times before reporting a problem, so a cold
start looks like a slow click rather than an error.

**Change the timeout** without a redeploy:

```bash
fly secrets set IDLE_SHUTDOWN_S=1800    # half an hour
fly secrets set IDLE_SHUTDOWN_S=0       # stay up around the clock
```

A browser tab left open on a page that polls the Engine counts as use and will
keep it awake. Close the tab when you are done for the day.

**The volume is billed either way.** Disk is charged per GB-month whether the
machine runs or not, so a 10GB volume costs the same while asleep. Only the
CPU and RAM stop.

**Scaling.** One machine processes jobs one at a time. For more throughput:

```bash
fly scale count 2
```

Each machine needs its own volume, and each runs its own worker. Jobs are
claimed from the database, so they will not collide.

## When YouTube says "sign in to confirm you're not a bot"

YouTube scores the address a request comes from, and a cloud machine's address
scores badly. The same video your browser plays without a thought can be
refused to the Engine. The image already does everything that can be done
from this side: it mints a PO token locally, solves YouTube's JavaScript
challenge with Node, uses IPv4 only, and tries several player clients before
giving up. No account and no cookies are involved.

If a link is still refused, there are two reliable ways out.

**A residential proxy.** This is the real fix: it gives requests an address
that is not a datacentre. Any residential provider works.

```bash
fly secrets set YTDLP_PROXY="http://user:pass@host:port"
```

**Upload the file instead.** Download the video yourself and upload it in the
Library. Nothing is asked of YouTube, so nothing can be refused.

A cookies file is a third option and the worst one. Put a `cookies.txt` at
`/data/cookies.txt` on the volume and the Engine will use it. The cookies
expire within weeks, and the Google account that exported them can be
rate-limited or locked for being used from a server — so never use your own
account for this.

## Faster transcription with Groq

Transcribing on the Engine's own CPU is the slow part of a job: minutes for a
long video. Groq runs the same Whisper family on their hardware at a couple of
hundred times real time, and at `whisper-large-v3-turbo` rather than the
`small` model this machine can afford. A 20-minute video costs about 1.3 cents
and comes back in seconds.

```bash
fly secrets set GROQ_API_KEY="gsk_..."
```

That is the whole change. With a key set the Engine uses Groq; without one it
uses its own CPU, and it falls back to the CPU on its own if Groq is
rate-limited or down. To check which is live:

```
GET /v1/health   ->   "transcribe_provider": "groq" | "faster-whisper"
```

To pin it either way, set `TRANSCRIBE_PROVIDER` to `groq` (fail loudly if Groq
is unreachable) or `faster-whisper` (never leave the machine). Audio leaves the
Engine when Groq is in use, which is the trade being made.
