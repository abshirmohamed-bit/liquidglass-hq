# Deploying the crayZmundo Engine

**You do not need a terminal for this.** Fly is connected to this GitHub repo and
redeploys the Engine whenever `engine/` changes on `main`. Push, and it ships.

Watch a deploy at https://fly.io/apps/crayzmundo-engine/monitoring

The Engine itself runs continuously — it does not stop when you close your laptop.
Using crayZmundo day to day means opening the site and pasting a link. Nothing else.

---

## If something is wrong

Three commands, and only when you are actually debugging:

```bash
fly logs -a crayzmundo-engine          # why did that fail?
fly status -a crayzmundo-engine        # is it running?
fly deploy ./engine -a crayzmundo-engine   # force a deploy if GitHub did not
```

## If you ever need to set a secret

```bash
fly secrets set NAME="value" -a crayzmundo-engine
```

Setting a secret restarts the machine, which is how it takes effect.

---

## What was set up once, and never needs doing again

| Thing | Value |
| --- | --- |
| App | `crayzmundo-engine` in `syd` |
| Machine | performance-2x, 4GB, always on |
| Volume | `crayz_data`, 10GB at `/data` — database and Whisper weights |
| Object storage | Tigris bucket `long-glitter-1327` for finished clips |
| Secrets | `ENGINE_API_KEYS`, `WEBHOOK_SECRET`, `WEBHOOK_URL`, `PUBLIC_BASE_URL`, `S3_PUBLIC_BASE_URL`, plus the five Fly set for Tigris |

The only one still missing is `ANTHROPIC_API_KEY`, which upgrades moment-finding
from transcript rules to AI judgement. Everything works without it.

---

## Settings that must not change

**`auto_stop_machines = "off"`** — Fly's proxy cannot see a render in progress, so
autostop would kill jobs mid-encode.

**`kill_timeout = "300s"`** — must stay above the Engine's `SHUTDOWN_GRACE_S` (120s),
or a deploy kills work that is already running. Anything interrupted is requeued on
the next boot, so nothing hangs in "processing" forever.

**These are top-level keys in `fly.toml`.** In TOML a key written after a `[table]`
header belongs to that table, so keep them above the first `[section]`.

---

## Things that will bite you if changed

**`auto_stop_machines = "off"` must stay off.** Fly's proxy only sees inbound
HTTP. It cannot see a render in progress, so with autostop on, Fly would stop
the machine mid-encode and the export would never finish.

**`kill_timeout = "300s"` must stay above `SHUTDOWN_GRACE_S` (120s).** On
deploy, Fly sends SIGTERM; the Engine stops taking new work and lets the
current render finish. If the timeout is shorter than the render, Fly sends
SIGKILL and the work is lost. Anything interrupted anyway is put back in the
queue on the next boot, so nothing hangs in "processing" forever.

**These are top-level keys in `fly.toml`.** In TOML, a key written after a
`[table]` header belongs to that table. Keep `kill_signal` and `kill_timeout`
above the first `[section]` or Fly silently ignores them.

---

## Optional: run the tests before every deploy

Fly's GitHub integration builds and ships whatever you push. If you would
rather a red test suite blocked the deploy, use a GitHub Actions workflow
instead of (not alongside) Fly's integration, or the two will both deploy.
Ask and I'll add `.github/workflows/fly-engine.yml`, which runs the 62 tests
first and only then calls `flyctl deploy ./engine --remote-only`.

---

## Running it

```bash
fly logs                       # live
fly ssh console                # a shell on the machine
fly scale show                 # what you are paying for
fly scale vm performance-4x    # renders feel slow
fly volumes extend <id> -s 25  # running out of disk
```

**Cost.** `performance-2x` with 4GB running continuously is the bulk of the
bill, plus Tigris storage and egress. Encoding is the expensive part; check
Fly's current pricing before committing.

**Scaling.** One machine processes jobs one at a time. For more throughput:

```bash
fly scale count 2
```

Each machine needs its own volume, and each runs its own worker. Jobs are
claimed from the database, so they will not collide.
