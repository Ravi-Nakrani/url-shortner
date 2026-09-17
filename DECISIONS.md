# Design Decisions

A running log of architectural decisions, the alternatives considered, and why each was
rejected. Kept up to date phase by phase — this doubles as interview prep material.

---

## Phase 0

### Short-code generation: random base62 + collision retry via unique index

**Chosen**: generate a random 7-character base62 string (`generateShortCode` in
[src/lib/shortcode.ts](src/lib/shortcode.ts)) and rely on MongoDB's unique index on
`shortCode` to reject collisions. On a duplicate-key error, the caller (Phase 1's create
route) retries with a freshly generated code.

**Alternatives considered**:

- **Atomic counter (base62-encode an incrementing integer)** — rejected. Requires a
  separate counter document and an atomic `findOneAndUpdate` increment on every create,
  which is an extra moving part and a single point of write contention. It also leaks
  information (link volume and creation order) through the short code itself.
- **Hash of the destination URL (e.g. truncated SHA-256)** — rejected. The same long URL
  always maps to the same short code, which isn't necessarily desired (a user may want
  two independent short links to the same destination), and truncating a hash still
  needs its own collision-handling strategy — so it doesn't actually avoid the problem
  the counter approach has, it just changes where the collision risk comes from.

**Why this wins**: it's stateless (no counter document, no extra query before insert),
collision probability is negligible at 7 base62 characters (62^7 ≈ 3.5 trillion
possibilities), and it turns the database's own unique constraint into the single
source of truth for collision-freedom — there's no separate "check if it exists, then
insert" step that could race under concurrent requests. The retry-on-duplicate-key
pattern is a standard, well-understood way to handle this safely under concurrency.

### Cached/global Mongoose connection for serverless

**Chosen**: a module ([src/lib/db/connect.ts](src/lib/db/connect.ts)) that caches the
Mongoose connection (and the in-flight connection promise) on `globalThis`, so repeated
invocations of the same warm serverless function reuse one connection instead of opening
a new one per request.

**Why**: serverless functions can be invoked many times against the same warm container.
Without caching, each invocation would call `mongoose.connect()` again, and MongoDB
Atlas's free M0 tier has a hard cap on concurrent connections — this would exhaust it
quickly under any real traffic. Caching the promise (not just the resolved connection)
also avoids a race where two concurrent invocations both see `conn === null` and both
start a new connection attempt.

### Env var validation via zod at module load

**Chosen**: [src/lib/env.ts](src/lib/env.ts) parses `process.env` through a zod schema
once, at import time, and throws a descriptive error immediately if anything required is
missing or malformed.

**Why**: failing fast and loudly at startup (or at the first import in a serverless
context) is far easier to diagnose than a `MONGODB_URI is not defined` or a raw
Mongoose connection error surfacing deep inside a request handler.

### No Redis, no external queue

**Chosen (fixed by the project spec)**: MongoDB Atlas is the only backing store for this
build — no Redis for caching/rate-limiting, no external queue (QStash/SQS/etc.) for
async work. This is deliberate for a one-week build learning one new database, not an
oversight. The outbox pattern (Phase 2/3) and rate limiting (Phase 4) are both
implemented on top of plain MongoDB collections instead.

**What I'd add at scale**: a real message queue (SQS, or a managed Kafka) for the click
event pipeline instead of a polled outbox table, and Redis for rate-limiting and for
caching hot `shortCode → longUrl` lookups ahead of the database on the redirect path.

### External scheduler (GitHub Actions) instead of Vercel Cron — _(will be exercised in Phase 3, decision made now)_

**Chosen**: GitHub Actions on a fixed interval will call a protected
`/api/process-outbox` endpoint to drain the outbox, rather than using Vercel's built-in
Cron Jobs.

**Why**: Vercel's Hobby (free) tier limits Cron Jobs to once per day, which is far too
infrequent for near-real-time click analytics. GitHub Actions' scheduled workflows are
free and support minute-level granularity, so it's used as the external trigger instead.

### Bounded-batch draining instead of drain-to-completion — _(will be exercised in Phase 3, decision made now)_

**Chosen**: the drain endpoint will process a capped batch (`limit(N)`, starting at
N=200) of outbox events per invocation, not the entire backlog.

**Why**: an unbounded drain risks a single invocation running long enough to hit a
serverless function's execution time limit, and makes worst-case latency depend on
however large the backlog has grown. A bounded batch keeps each run's cost predictable
and lets the scheduler's fixed interval naturally catch up over multiple runs if a
backlog does build up.

### Outbox pattern instead of fire-and-forget click tracking — _(will be exercised in Phase 2, decision made now)_

**Chosen**: the redirect handler writes one durable `outbox_events` document as part of
its own request (after resolving the destination, before responding), rather than
firing off an unawaited analytics call.

**Why**: a fire-and-forget write in a serverless function is not reliable — the
function's execution environment can be frozen or torn down before an unawaited promise
resolves, silently dropping click events. Writing the outbox entry synchronously (but
cheaply — a single small insert) guarantees the event is durably recorded before the
function returns, while keeping the heavier aggregation work (Phase 3) out of the
redirect's critical path entirely.

---

## Phase 1

### Redirect status code: 301 (permanent)

**Chosen**: `GET /[shortCode]` issues a `301 Moved Permanently` redirect, not `302`.

**Why**: a given short code maps to exactly one destination for its entire lifetime in
this design (links aren't edited in place), so 301 is the semantically correct status
and is more cacheable by browsers/CDNs. The tradeoff, worth being able to explain: if a
future feature ever let a link's destination be changed after creation, a 301 previously
cached by a visitor's browser could keep sending them to the old destination even after
the database is updated — 302 would avoid that at the cost of every hit re-checking with
the server. Since links are immutable here, 301 is the right choice for this design.

### Duplicate `longUrl` submissions return the existing short code

**Chosen**: `linkService.createLink` first checks for an existing link with the same
`longUrl` (via a plain, non-unique index) and returns it unchanged rather than minting a
new code every time the same URL is submitted.

**Why**: avoids link sprawl (many different short codes pointing at the identical
destination) and matches a common user expectation ("I already shortened this"). Because
this phase has no per-user ownership yet, the dedupe is global/anonymous — two different
visitors shortening the same URL get the same code. This is worth revisiting once
Phase 5 introduces authenticated ownership, where per-user dedupe might be more
appropriate than global dedupe; that's an open question deliberately deferred rather
than silently decided now. The lookup-then-insert isn't wrapped in a transaction, so a
very tight race between two brand-new identical submissions could in principle produce
two codes for the same URL — an accepted, low-frequency edge case rather than added
transactional complexity.

### URL scheme restricted to http/https

**Chosen**: `createLinkSchema` rejects any URL whose protocol isn't `http:` or `https:`
(e.g. `javascript:`, `data:`), in addition to zod's baseline `.url()` syntax check.

**Why**: `GET /[shortCode]` issues a server-side redirect, so this app itself isn't
directly exploitable via script-injection through the destination URL — but without this
check, the shortener would happily mint a short link that hands anyone who clicks it a
`javascript:` or `data:` URL, i.e. it would function as an open redirector to dangerous
schemes. This narrow check is handled here rather than deferred entirely to Phase 4's
broader abuse-prevention work, since it's a two-line addition to an already-required
validation schema, not a new subsystem.

### Redirect latency baseline (local, warm connection)

Measured against a local dev server with an already-established Atlas connection:
~20-50ms per redirect. This is the number Phase 2's outbox-insert overhead and Phase 7's
Edge Function migration will be compared against.
