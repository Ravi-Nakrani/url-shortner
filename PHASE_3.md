# Phase 3 — Bounded-Batch Outbox Drain

## Goal (restated from master spec)

Turn raw `outbox_events` into aggregated, dashboard-ready data, without ever risking an unbounded processing run. A dedicated, secret-protected `POST /api/process-outbox` endpoint drains a capped batch of unprocessed events per invocation; a GitHub Actions scheduled workflow calls it on a fixed interval. The dashboard (Phase 6) will only ever read the aggregated result — it never triggers or waits on draining, so read latency stays independent of backlog size.

---

## 1. File / folder structure to be created or modified

```
src/
├── lib/
│   ├── db/
│   │   └── models/
│   │       ├── ClickStats.ts          # new: daily per-link click rollup
│   │       └── ReferrerStats.ts       # new: daily per-link per-referrer rollup
│   └── services/
│       └── outboxDrainService.ts      # new: drainOutbox() — the actual batch-processing logic
└── app/
    └── api/
        └── process-outbox/
            └── route.ts                # new: POST /api/process-outbox — auth + call drainOutbox()
.github/
└── workflows/
    └── drain-outbox.yml                # new: scheduled job calling the endpoint every 5 minutes
tests/
└── outboxDrainService.test.ts          # new: unit tests for the grouping/aggregation logic
```

Why `outboxDrainService.ts` separate from the route: the route's job is just auth + "call the drain, return its summary" — the actual batch-fetch → group → aggregate → mark-processed logic is what needs unit coverage, and it shouldn't need a fake `NextRequest` to test.

---

## 2. Schemas / types / interfaces

### Two rollup collections, not one

The master spec offers a choice between per-click documents (aggregated at read time) and pre-aggregated rollups, recommending rollups for cheap dashboard reads — that recommendation is adopted. Within that, this phase uses **two** rollup collections rather than one document per `{shortCode, day}` with a nested referrer map:

```typescript
// src/lib/db/models/ClickStats.ts
export interface IClickStats {
  shortCode: string;
  date: string; // "YYYY-MM-DD", UTC
  clicks: number;
}
// unique index: { shortCode: 1, date: 1 }
```

```typescript
// src/lib/db/models/ReferrerStats.ts
export interface IReferrerStats {
  shortCode: string;
  date: string; // "YYYY-MM-DD", UTC
  referrer: string; // hostname, e.g. "google.com", or "direct" if none
  count: number;
}
// unique index: { shortCode: 1, date: 1, referrer: 1 }
```

**Why not a single document with a `referrers: { [host]: count }` map**: the drain has to _increment_ counts via MongoDB's raw `$inc` with a dot-path field name (e.g. `referrers.google.com`). MongoDB parses dots in an update path as nested-field separators — so a hostname containing a dot (nearly all of them) would silently create the wrong nested structure instead of incrementing a flat key. Sanitizing hostnames to avoid dots is possible but fragile and unreadable in the database. A separate collection with `referrer` as a plain field value (not a dynamic key) sidesteps the problem entirely, and as a side benefit makes Phase 6's "top referrers" query a plain `find({shortCode, date}).sort({count: -1})` instead of needing to unpack a map client-side.

`date` is stored as a `"YYYY-MM-DD"` string (derived from the event's UTC timestamp) rather than a truncated `Date` — it's trivially sortable/comparable, avoids timezone-normalization edge cases when truncating a `Date` to "just the day," and is simple to display as-is on the dashboard.

### Aligning collection naming with the master spec (small fix to Phase 2's model)

Mongoose's default collection-naming (lowercased, pluralized model name) turned `OutboxEvent` into collection `outboxevents`, not the `outbox_events` name the master spec's schema section uses. This phase sets the collection name explicitly (`{ collection: "outbox_events" }` in the schema options) on `OutboxEvent`, and does the same for the two new models (`click_stats`, `referrer_stats`), so Atlas's collection browser matches the spec's naming rather than Mongoose's auto-pluralization guess. **Flagging this because it's a change to already-deployed Phase 2 code**: any outbox events already written under `outboxevents` (from this project's own manual testing) won't be visible under the renamed `outbox_events` collection going forward. Since that data is only my own manual test clicks from Phase 2's verification, not anything you've relied on, I recommend just proceeding with the rename — confirm you're fine with that, or say if you'd rather leave the Phase 2 collection name as-is.

### `outboxDrainService.ts`

```typescript
export interface DrainResult {
  processedCount: number;
  groupsUpdated: number;
  tookMs: number;
}

export async function drainOutbox(batchSize: number): Promise<DrainResult>;
```

Internally:

1. Fetch the batch: `OutboxEvent.find({ processed: false }).sort({ timestamp: 1 }).limit(batchSize)`.
2. If empty, return immediately (`{ processedCount: 0, groupsUpdated: 0, tookMs }`) — no writes at all. This is what makes re-running drain on an empty backlog a fast no-op.
3. **Group the batch in memory** by `(shortCode, date, referrerHost)`, counting occurrences of each group — so a batch of 200 raw events collapses into however many distinct `(link, day, referrer)` combinations actually appear (often far fewer than 200), rather than issuing 200 separate database writes.
4. Build one MongoDB `bulkWrite` for `ClickStats` (one `updateOne` per distinct `(shortCode, date)` with `$inc: { clicks: <count> }`, `upsert: true`) and one `bulkWrite` for `ReferrerStats` (one `updateOne` per distinct `(shortCode, date, referrer)` group, same pattern).
5. Mark the batch's events processed: `OutboxEvent.updateMany({ _id: { $in: ids } }, { $set: { processed: true } })`.
6. Return the summary.

Referrer normalization: `new URL(referrer).hostname` when a referrer header is present and parses as a valid URL; `"direct"` otherwise (no referrer, or an unparsable value).

### `POST /api/process-outbox` route

1. Compare a request header (`x-outbox-secret`) against `env.OUTBOX_SECRET`; mismatch or missing → `401`, no further work, no details leaked about why.
2. Call `drainOutbox(200)` (batch size as a named constant, not a request-configurable parameter — no need for that knob at this scale).
3. Return the `DrainResult` as JSON with `200`.
4. Unhandled errors → `500` via the existing `apiError` helper, logged server-side.

New required env var: `OUTBOX_SECRET` (added to `env.ts`'s zod schema, `.env.local.example`, and documented in the README as something you also need to add to Vercel's env vars and to this GitHub repo's Actions secrets).

### GitHub Actions workflow (`.github/workflows/drain-outbox.yml`)

```yaml
name: Drain Outbox
on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch: {}
jobs:
  drain:
    runs-on: ubuntu-latest
    steps:
      - name: Call process-outbox endpoint
        run: |
          curl -sf -X POST "${{ secrets.APP_URL }}/api/process-outbox" \
            -H "x-outbox-secret: ${{ secrets.OUTBOX_SECRET }}" \
            -w "\nHTTP %{http_code}\n"
```

`workflow_dispatch` is included so the drain can be triggered manually from the GitHub Actions UI during this phase's review, rather than only waiting for the schedule to fire.

**Interval: every 5 minutes, not every 1-2.** The master spec allows "every 1-5 minutes"; GitHub's own scheduled-workflow documentation notes that schedules more frequent than 5 minutes aren't reliably honored (they can be delayed or dropped under platform load), so 5 minutes is the point in the allowed range that's actually dependable rather than aspirational.

This requires two GitHub Actions repository secrets you'll need to add yourself (Settings → Secrets and variables → Actions): `APP_URL` (your Vercel production URL) and `OUTBOX_SECRET` (matching the value set in Vercel's env vars).

---

## 3. Confirmation of fixed decisions vs. open questions

### Already fixed (not reopened)

- Bounded batch size (`limit(N)`, N=200) — fixed by the master spec.
- External scheduler (GitHub Actions), not Vercel Cron — fixed, documented in `DECISIONS.md`.
- Dashboard never triggers/waits on draining — fixed; nothing in this phase's code path is called from any read route (there are no read routes yet — that's Phase 6).
- Pre-aggregated rollups over per-click documents aggregated at read time — fixed (master spec's own recommendation, adopted).

### Open questions

1. **Renaming `OutboxEvent`'s collection** (`outboxevents` → `outbox_events`) to match the spec's naming — see above. Recommend proceeding since only my own test data is affected. **Confirm.**

2. **Processed events: keep (`processed: true`) vs. delete.** The master spec explicitly asks this to be decided and documented. I recommend **keep, marked processed**, not delete: it preserves the raw click record (shortCode, exact timestamp, referrer, user agent) for later reprocessing if the aggregation logic ever needs to change or had a bug, and for lower-level debugging or future features (e.g. a raw event export) — at negligible storage cost for a portfolio-scale project on Atlas's 512MB M0 tier. The tradeoff, worth stating explicitly: the `outbox_events` collection grows without bound over the project's lifetime since nothing ever removes old processed rows. A reasonable future improvement (noted here, not implemented now) would be a TTL index that expires _processed_ events after some retention window (e.g. 30 days) once the aggregates are trusted — bounding storage without touching the hot redirect path. **Confirm keep-and-mark, or prefer delete-after-aggregating.**

3. **Atomicity between aggregating and marking processed — the one real design decision in this phase.** Steps 4 and 5 above are two separate write operations (rollup `bulkWrite`s, then `OutboxEvent.updateMany`). If the process crashes or a network error happens between them, a batch could get aggregated into `ClickStats`/`ReferrerStats` but never marked `processed: true` — meaning the _next_ drain run would fetch and aggregate the same events again, double-counting those clicks. Two ways to handle this, and I'd like your call rather than silently picking one:
   - **(a) Accept the small risk, keep it simple.** This failure window is narrow (between two fast writes within one function invocation) and would only affect whatever batch was in flight at the exact moment of a crash — a rare, bounded, and self-correcting-in-magnitude issue for a portfolio project, not a financial ledger. No extra code.
   - **(b) Wrap both writes in a MongoDB multi-document transaction.** Atlas's M0 tier runs as a replica set, so multi-document ACID transactions are actually available here (not just on paid tiers) — wrapping the two `bulkWrite`s and the `updateMany` in one Mongoose session/transaction would make "aggregate + mark processed" atomic, eliminating the double-count window entirely. This is a legitimate, not-very-complex addition (a `mongoose.startSession()` + `withTransaction()` block) and a strong interview talking point about exactly-once processing semantics — but it is additional code and moving parts for a failure mode that's already rare and low-impact.

   **My recommendation is (b)** — it's a meaningful correctness improvement, isn't much code, and "I made outbox draining transactionally safe against double-counting, and here's why M0 can even support that" is a good sentence to be able to say out loud. But this is exactly the kind of tradeoff the project's own guidance says to surface rather than decide silently, so: **confirm (b), or tell me to keep it simple with (a).**

---

## 4. Review checkpoint (restated as concrete acceptance criteria)

Phase 3 is done when:

- [ ] Manually accumulating a batch of outbox events (via real redirects, or direct test inserts) and calling `/api/process-outbox` (via `workflow_dispatch` or a direct authenticated `curl`) drains them into `ClickStats`/`ReferrerStats` with correct counts.
- [ ] Calling the endpoint without the correct `x-outbox-secret` header returns `401` and does not touch the database.
- [ ] With more unprocessed events queued than the batch size (N=200), a single drain call processes only up to N and leaves the rest `processed: false` for the next run — verified by seeding >200 events directly and confirming the post-drain unprocessed count is `total - 200`.
- [ ] Re-running the drain against an empty/fully-processed backlog returns quickly with `processedCount: 0` and performs no writes.
- [ ] The GitHub Actions workflow successfully calls the deployed endpoint on its schedule (confirmed via the Actions run log) and via manual `workflow_dispatch`.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` (including the new `outboxDrainService.test.ts`) all pass; CI green.

---

**Please confirm the three open questions above (collection rename, keep-vs-delete processed events, and — most importantly — whether to add the transaction for atomic aggregate+mark-processed) before I begin implementation.**
