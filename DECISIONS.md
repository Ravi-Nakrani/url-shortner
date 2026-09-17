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

### Redirect status code: 302 (temporary), revised from an earlier 301

**Chosen**: `GET /[shortCode]` issues a `302 Found` redirect, not `301`.

**Why**: this reverses an earlier decision in this same phase to use `301 Moved
Permanently`. The original reasoning — a short code maps to exactly one destination for
its entire lifetime, so 301 is semantically correct and more cacheable — only weighed the
redirect in isolation and missed its interaction with click analytics, the project's
headline feature. A 301 is aggressively cached by browsers: once a visitor's browser has
cached the redirect, every _subsequent_ click from that browser never reaches the server
again, so no outbox event is ever written for it. That silently undercounts real repeat
traffic — the opposite of "durable click tracking." A 302 is not cached by default, so
every click reaches the server and is recorded, at the cost of one extra DB lookup per
redirect versus a browser-cached hit — a fully acceptable trade for a product whose value
proposition is accurate click data. Links being immutable in this design is true but
irrelevant to which status code serves the product's actual goal.

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

---

## Phase 2

### Outbox-insert failure does not fail the redirect

**Chosen**: the redirect handler awaits the `outbox_events` insert and logs a timing
line on success, but wraps the insert in its own `try/catch` — if it throws, the error
is logged server-side and the redirect proceeds anyway.

**Why**: the user is only ever waiting on the redirect, not on analytics. Making a
redirect's success depend on a _second_ database write (beyond the lookup that already
happened) would widen the redirect's failure surface for the sake of click tracking,
which cuts against the whole point of decoupling analytics from the hot path. The
accepted cost is that a rare transient Atlas hiccup on that one insert loses a single
click event rather than failing the user's redirect — a deliberately asymmetric
tradeoff (protect the primary user-facing action, accept best-effort on the secondary
one) that's worth being able to defend explicitly if asked.

### Outbox-insert latency measurement

Instrumented with a `console.log` timing line around the insert
(`[outbox] recorded click for <code> in <ms>`), visible in dev server logs and (after
deploy) in Vercel function logs. Measured locally: the insert itself takes ~15-35ms;
end-to-end redirect latency correspondingly moved from the Phase 1 baseline of
~20-50ms to ~50-80ms. Confirmed via direct collection counts that this insert is never
lost or duplicated: 15/20-request concurrent bursts against the same and different
short codes each produced exactly one outbox document per request, and hitting a
nonexistent short code (404) produces zero outbox documents, since there's no click to
record without a resolved destination.

---

## Phase 3

### Two rollup collections instead of one document with a nested referrer map

**Chosen**: `click_stats` (`{shortCode, date, clicks}`, one document per link per day)
and `referrer_stats` (`{shortCode, date, referrer, count}`, one document per
link-per-day-per-referrer) as two separate collections, rather than a single
`click_stats` document per `{shortCode, date}` with a `referrers: { [host]: count }`
nested map.

**Why**: the drain increments counts via MongoDB's raw `$inc` with a dot-separated field
path. A dynamic map key containing dots — which is nearly every hostname
(`www.google.com`) — gets parsed by MongoDB as nested-field separators in an update
path, silently producing the wrong document shape instead of incrementing a flat key. A
separate collection with `referrer` as an ordinary field _value_ (not a dynamic key)
avoids the problem entirely, and as a side benefit makes Phase 6's "top referrers" query
a plain `find({shortCode, date}).sort({count: -1})` instead of needing to unpack and
sort a nested map client-side.

### Collection naming aligned with the spec (`outbox_events`, not `outboxevents`)

**Chosen**: `OutboxEvent`'s schema now explicitly sets `{ collection: "outbox_events" }`
(previously left to Mongoose's default lowercased-pluralized naming, which produced
`outboxevents`); the two new models explicitly name their collections `click_stats` and
`referrer_stats` for the same reason.

**Why**: matches the master spec's own naming convention and makes the collection list
in Atlas's UI legible against the spec rather than requiring a mental translation. This
was a small breaking change to already-deployed Phase 2 code — the only data affected
was this project's own manual test clicks, so the rename was made outright rather than
adding a migration step for data that didn't need preserving.

### Processed outbox events are kept (`processed: true`), not deleted

**Chosen**: after aggregating, events are marked `processed: true` rather than removed
from the collection.

**Why**: preserves the raw per-click record (exact timestamp, referrer, user agent) for
later reprocessing if the aggregation logic changes or had a bug, and for any future
feature needing raw event detail — at negligible storage cost for a portfolio-scale
project on Atlas's 512MB M0 tier. The accepted tradeoff: `outbox_events` grows without
bound over the project's lifetime. **What I'd add at scale**: a TTL index expiring
_processed_ events after a retention window (e.g. 30 days) once the aggregates are
trusted — bounding storage without touching the hot redirect path, implemented as a
background index rather than application code.

### Transactional aggregate-and-mark-processed

**Chosen**: the drain's two rollup `bulkWrite`s and the `OutboxEvent.updateMany` that
marks the batch processed all run inside one MongoDB multi-document transaction
(`mongoose.startSession()` + `session.withTransaction()`).

**Why**: without a transaction, a crash or network error between "write the rollups"
and "mark the batch processed" would leave those events aggregated _and_ still
`processed: false` — the next drain run would fetch and aggregate the same batch again,
double-counting those clicks. Atlas's M0 free tier runs as a replica set, which is all
multi-document transactions require — so this isn't a paid-tier-only feature being
skipped for cost reasons, it's genuinely available here. Wrapping the batch in a
transaction is a small, contained change (one session, one `withTransaction` closure)
that eliminates an entire class of double-counting bugs, which is a good trade for the
added code.

### In-memory grouping before writing

**Chosen**: the drain groups a batch's raw events by `(shortCode, date)` and
`(shortCode, date, referrer)` in memory first, then issues one `bulkWrite` per
collection containing one `updateOne` per distinct group — rather than issuing one
database write per raw event.

**Why**: a batch of 200 raw click events for a handful of popular links collapses into
a much smaller number of distinct group combinations; grouping first means the number
of database round-trips scales with distinct `(link, day[, referrer])` combinations in
the batch, not with the batch size itself.

### GitHub Actions schedule: every 5 minutes, not more frequent

**Chosen**: the drain workflow's cron schedule is `*/5 * * * *`, the least-frequent end
of the master spec's allowed "every 1-5 minutes" range.

**Why**: GitHub's own documentation for scheduled workflows notes that schedules more
frequent than 5 minutes aren't reliably honored — they can be delayed or silently
skipped under platform load. 5 minutes is the point in the spec's allowed range that's
actually dependable rather than aspirational. `workflow_dispatch` is also enabled on the
workflow so a drain can be triggered on demand (used during this phase's manual review)
without waiting on the schedule.

### Verified against the real database

- Auth: a missing or incorrect `x-outbox-secret` header returns `401` with no writes.
- A batch of 6 real clicks (via actual redirects, 3 referrers) drained into exactly the
  expected `click_stats`/`referrer_stats` documents and counts.
- Re-running the drain against an empty backlog returned in ~14ms and performed zero
  writes.
- 250 events seeded directly into `outbox_events`: a single drain call processed
  exactly 200 (the batch cap) and left 50 unprocessed; a second call drained the
  remaining 50 — confirming the batch cap actually bounds work per invocation rather
  than draining to completion.

---

## Phase 4

### Fixed-window rate limiting via one atomic MongoDB upsert

**Chosen**: `POST /api/links` is limited to 10 requests per 60-second window per client
IP, implemented as a single atomic `RateLimit.findOneAndUpdate({key}, {$inc:{count:1},
$setOnInsert:{expiresAt}}, {upsert:true, new:true})`, where `key` embeds the identifier
and the current window's start timestamp (`floor(now / windowMs) * windowMs`).

**Why atomic upsert-increment over read-then-write**: a "read the current count, check
it, write count+1" pattern has a race window — two concurrent requests can both read
the same count before either writes, both see themselves as "under the limit," and both
get admitted, silently exceeding it. `$inc` inside `findOneAndUpdate` is atomic at the
database level, so concurrent requests in the same window are serialized correctly by
MongoDB itself with no read-then-write gap to race in.

**Why fixed window over sliding window (the tradeoff, stated explicitly)**: a fixed
window is simple to reason about and implement as one atomic operation, but has a known
weakness — a client can send up to `limit` requests at the very end of one window and
another `limit` at the very start of the next, admitting up to `2×limit` requests in a
short burst that straddles the boundary. A sliding-window counter (weighting the
previous window's count by how much of it overlaps "now") avoids this at the cost of
more bookkeeping (tracking two windows' counts instead of one) and more complex
reasoning about correctness. For a portfolio-scale project the accepted burst is bounded
and self-limiting (at most one extra window's worth of requests, ever), so the fixed
window's simplicity wins here — but the boundary case is worth being able to describe
precisely if asked, rather than presented as if it doesn't exist.

**TTL index instead of manual cleanup**: `rate_limits` has a TTL index on `expiresAt`
(`expireAfterSeconds: 0`, i.e. expire exactly at the stored time). MongoDB's own
background process removes each window's counter document once its window ends, so
the collection never accumulates unbounded history and no cron/cleanup job is needed —
consistent with the "let the database do the bookkeeping" pattern already used for
short-code collision-freedom (Phase 0) and the outbox drain index (Phase 2).

**What a Redis-backed limiter would buy over this at scale**: Redis's `INCR`+`EXPIRE`
(or a sorted-set-based sliding window) is faster per-request than a MongoDB round-trip,
and a token-bucket algorithm (smoothing request admission over time rather than hard
window edges) is straightforward to implement with Redis's atomic operations. At this
project's scale, one extra MongoDB write per link-creation request is negligible
overhead, so Redis isn't a meaningful win here — it becomes one once request volume is
high enough that shaving milliseconds off every write actually matters, which is a
"when you'd reach for it" answer rather than a "you need it now" one.

### Reject self-referential short links

**Chosen**: `POST /api/links` rejects a `longUrl` whose host matches the app's own
request host (i.e. someone trying to shorten a link that points back at this same
shortener), returning a `VALIDATION_ERROR` before ever calling `createLink`.

**Why**: without this check, nothing stops a short link from pointing at another short
link on the same domain, including — in the degenerate case — at itself, creating a
redirect loop. This is a narrow, cheap, self-contained check (compare two hostnames),
in the same spirit as Phase 1's `javascript:`/`data:` scheme restriction: a two-line
addition to existing validation rather than a new subsystem, kept separate from the
broader "malicious domain blocklist" idea the master spec calls fully optional and out
of scope for this build.

### Verified against the real database

- 10 requests from the same IP succeed; the 11th and 12th in the same window return
  `429` with a `RATE_LIMITED` error code and a `Retry-After` header containing a sane
  remaining-seconds value.
- Two different IPs (simulated via `X-Forwarded-For`) are rate-limited fully
  independently: exhausting one IP's window has no effect on the other's.
- The `rate_limits` collection's unique index on `key` and TTL index on `expiresAt`
  (`expireAfterSeconds: 0`) are both confirmed present in Atlas.
- Shortening `http://<this-app's-own-host>/anything` is rejected with a clear
  validation error rather than silently creating a link.

---

## Phase 5

### GitHub OAuth + JWT sessions, no database adapter

**Chosen**: NextAuth v5 (Auth.js) with a single GitHub OAuth provider and the `jwt`
session strategy — no `@auth/mongodb-adapter`, no `users`/`accounts`/`sessions`
collections.

**Why**: NextAuth's official MongoDB adapter needs a raw native `MongoClient`, not
Mongoose — adopting it would mean running two separate MongoDB client instances against
the same Atlas cluster (Mongoose for all application data, a native driver client just
for auth bookkeeping), which is a second moving part this project doesn't otherwise
need. With a JWT session, the session lives entirely in a signed cookie: `link.userId`
is simply the GitHub account's id, and the whole app keeps talking to MongoDB through
the one Mongoose connection already established in Phase 0. The accepted tradeoff: no
server-side session revocation (can't force-logout a user without rotating the app's
secret) and no queryable `Users` collection. **What I'd add if this needed instant
revocation at scale**: switch to database-backed sessions (the adapter), accepting the
second client as the cost of that capability.

### GitHub OAuth Apps only support one callback URL each — two apps, not one

**Chosen**: two separate GitHub OAuth Apps, one for local dev
(`http://localhost:3000/api/auth/callback/github`) and one for production
(`https://<vercel-domain>/api/auth/callback/github`), each with its own Client ID/Secret
used in `.env.local` vs. Vercel's env vars respectively.

**Why**: GitHub's classic OAuth Apps accept exactly one authorization callback URL per
app — there's no way to register both a localhost and a production callback on a single
app, so local development and the deployed app need registrations of their own.

**What actually happened**: only one OAuth App was created in practice, registered with
the production callback URL. This was a deliberate call at setup time to skip the extra
registration step, accepting that GitHub sign-in can't be exercised against `localhost`
as a result — `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` are the same value in both
`.env.local` and Vercel, so everything _except_ the OAuth handshake itself works
locally (anonymous link creation, the rate limiter, the outbox, etc.); the actual
sign-in flow was verified end-to-end against the deployed Vercel app instead. Setting
up the second, localhost-callback app remains a five-minute addition if local OAuth
testing is ever needed.

### Anonymous link creation stays open; ownership attaches when signed in

**Chosen**: `POST /api/links` never requires a session. When one exists, the created
link's `userId` is set to the signed-in user's id; when it doesn't, `userId` stays
`null`, exactly as before this phase.

**Why**: the homepage's core "paste a URL, get a short link" flow is this project's
primary action and shouldn't be gated behind a login wall — that would meaningfully
change the product for anonymous visitors for the sake of a feature (link management)
that only matters to users who want to come back and manage what they've created.

### Duplicate-URL dedupe becomes owner-scoped (resolving Phase 1's deferred question)

**Chosen**: `createLink`'s existing-link lookup changed from `{ longUrl }` to
`{ longUrl, userId }`. A signed-in user resubmitting a URL they've already shortened
gets their existing link back; a different signed-in user, or an anonymous visitor,
shortening the identical URL gets their own independent new code.

**Why**: this was explicitly flagged as an open question back in Phase 1's dedupe
decision, deferred until real ownership existed to resolve it against. Global dedupe
across unrelated users doesn't make sense once links are actually owned — two different
people shortening the same article shouldn't be forced to share one link (and one
dashboard entry) with each other; scoping the lookup by owner keeps each user's "my
links" list reflecting only what they themselves created, while still avoiding
duplicate entries for the same user re-shortening a URL they'd already saved.

### Indistinguishable 404 for ownership failures

**Chosen**: `PATCH`/`DELETE /api/links/[shortCode]` return the same `404 NOT_FOUND` both
when the short code doesn't exist at all and when it exists but belongs to a different
user — never a `403` that would confirm "this exists, you just can't touch it."

**Why**: a `403` leaks a bit of information a non-owner has no legitimate need for —
that a given short code is a real, claimed link. Returning `404` in both cases costs
nothing functionally (the legitimate owner still gets a clear, correct response) and is
a small, free defense-in-depth habit: never confirm the existence of something the
caller isn't authorized to see, only what they're allowed to see.

### Deletes don't cascade to analytics

**Chosen**: deleting a link removes only the `Link` document. Any `outbox_events`,
`click_stats`, or `referrer_stats` rows already recorded for that `shortCode` are left
untouched.

**Why**: historical click data is a record of what already happened and arguably should
persist even after the link itself is removed — most analytics tools don't erase
history when the thing being measured is archived. Cascading the delete would also mean
deciding what happens to _unprocessed_ outbox events for a shortCode whose link just
disappeared (drain them anyway? discard them?) for a low-value edge case at this
project's scale — not worth the added complexity here.

### Verified

- Signing in via GitHub, `/dashboard`'s middleware redirect for unauthenticated
  visitors, `401` on `GET`/`PATCH`/`DELETE /api/links*` without a session, and
  anonymous link creation continuing to work unchanged were all verified directly
  (the OAuth flow itself requires the real GitHub OAuth Apps described above, set up
  outside this environment).
- Next.js 16 deprecated the `middleware.ts` file convention in favor of `proxy.ts`
  mid-build (a "middleware" deprecation warning surfaced during `next build`) — the
  file was renamed with no logic changes; confirmed the deprecation warning is gone and
  the route protection still works identically afterward.
- The first production deploy of this phase failed at build time
  (`Invalid environment configuration ... AUTH_SECRET: Invalid input: expected string,
received undefined`) because `AUTH_SECRET` hadn't been added to Vercel's env vars yet
  (only `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` had been) — exactly the fail-fast behavior
  `env.ts` was built for back in Phase 0, catching a misconfiguration at build time
  rather than at request time in production. Fixed by adding the missing var and
  redeploying.
- The full GitHub sign-in flow (redirect to GitHub, authorize, redirect back
  authenticated) and the complete "My Links" dashboard CRUD (create while signed in,
  edit alias with a working conflict error on a taken alias, set/clear expiry with the
  redirect route respecting it, delete) were verified end-to-end against the deployed
  Vercel app.

---

## Phase 6

### Single accent hue for both charts, not a categorical palette

**Chosen**: both the clicks-over-time chart and the top-referrers chart use the app's
one existing `--accent` token for every mark — no multi-hue categorical palette was
introduced.

**Why**: consulted the `dataviz` skill before writing any chart code, per its own
trigger criteria. Its form-selection rule is explicit: a bar/line chart whose bars or
line represent a single measure (total clicks) across nominal categories that have no
natural order (dates, referrer domains) takes **one series → one color**; a categorical
rainbow is reserved for genuinely _distinct series_ plotted together (e.g. multiple
lines, one per link, on the same chart — which this dashboard doesn't do). Coloring
each referrer bar a different hue would have been the exact "value-ramp / rainbow on
nominal categories" anti-pattern the skill calls out: it burns the identity channel on
information the bar's length and axis label already show, and would have undercut the
app's own restrained, single-accent visual identity for no actual gain in readability.
Both charts also skip a legend, per the same reasoning: a single series needs no legend
box, since the chart's own title already says what's plotted.

### Two rollup collections again pay off: aggregate `$group` queries need no new indexes

**Chosen**: `getAnalyticsForUser`'s three aggregation queries (`$match` + `$group` on
`click_stats` twice, once on `referrer_stats`) run entirely against the compound
indexes Phase 3 already created (`{shortCode, date}` unique on `click_stats`,
`{shortCode, date, referrer}` unique on `referrer_stats`) — no new indexes were added
in this phase.

**Why**: this is the same reasoning already logged in Phase 3's decision to use
`referrer` as a plain field rather than a nested map — a plain field is both
increment-safe _and_ query-friendly. Confirmed directly rather than assumed: `.explain()`
against real Atlas data shows every one of the three aggregations resolving to
`GROUP → FETCH → IXSCAN` on the relevant compound index, never a `COLLSCAN`.

### `DrainMeta` updates on every drain invocation, including empty no-ops

**Chosen**: `outboxDrainService.drainOutbox()` now writes `{ lastDrainedAt: now,
processedCount }` to a `DrainMeta` singleton document after **every** call — including
when the backlog was empty and nothing was aggregated.

**Why**: the master spec asks the dashboard to honestly surface "data current as of
[last drain time]." If the timestamp only updated on non-empty runs, a fully
caught-up system — which is the normal steady state once the backlog is drained —
would show an increasingly stale-looking timestamp purely because there was nothing
new to find, misrepresenting a healthy, current system as a lagging one. Updating on
every invocation instead answers the honest question a freshness indicator should
answer: "when did the system last check," not "when did it last find something."

### Analytics scoped to owned links only; anonymous clicks aren't visualized anywhere

**Chosen**: `getAnalyticsForUser` only ever aggregates `click_stats`/`referrer_stats`
rows whose `shortCode` belongs to one of the caller's own `Link` documents. Clicks on
anonymous (`userId: null`) links are recorded in the outbox and rolled up into the
stats collections exactly as before, but there is no view anywhere in the app that
surfaces them.

**Why**: a direct, unavoidable consequence of Phase 5's ownership model — an
anonymous link has no owner to show a dashboard to. This wasn't a fresh decision so
much as this phase's read path simply respecting a boundary Phase 5 already drew.

### Verified

- The daily-clicks, per-link-totals, and top-referrers aggregation queries were run
  directly against real seeded Atlas data (bypassing the unreachable-locally OAuth
  flow) and produced correct results; `.explain()` on all three confirmed
  `IXSCAN`/`FETCH`/`GROUP` plans using the expected compound index, with no collection
  scans.
- Because these queries only ever touch `click_stats`/`referrer_stats` — never
  `outbox_events` — the analytics read path's latency is structurally independent of
  outbox backlog size by construction, not just by observation (there is no code path
  from this phase that could touch the outbox collection at all).
