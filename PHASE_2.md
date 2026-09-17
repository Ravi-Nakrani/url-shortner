# Phase 2 — Outbox Write on Redirect

## Goal (restated from master spec)

Make click events durable without slowing down or meaningfully complicating the redirect path. On every redirect, after resolving `shortCode` → `longUrl`, insert one `outbox_events` document — synchronously, as part of the same request — then send the redirect response. No aggregation, no draining logic yet (that's Phase 3). Measure the latency this adds against Phase 1's baseline (~20-50ms locally).

This phase is the concrete implementation of the outbox-over-fire-and-forget decision already logged in `DECISIONS.md` under Phase 0: a fire-and-forget write in a serverless function isn't reliable because the execution environment can be frozen/torn down before an unawaited promise resolves. This phase makes that real by awaiting a small, cheap insert before responding.

---

## 1. File / folder structure to be created or modified

```
src/
├── lib/
│   ├── db/
│   │   └── models/
│   │       └── OutboxEvent.ts        # new: outbox_events schema + interface
│   └── services/
│       └── outboxService.ts          # new: recordClickEvent() — one function, one job
└── app/
    └── [shortCode]/
        └── route.ts                  # modified: call recordClickEvent() after lookup, before redirect
tests/
└── outboxService.test.ts             # new: unit test — verifies the event shape written on a click
```

Why a separate `outboxService.ts` rather than inlining the insert in the route handler: keeps the route handler's job legible (look up → record → redirect) and makes the "what exactly do we capture on a click" logic independently testable, consistent with how `linkService.ts` was factored out in Phase 1.

---

## 2. Schemas / types / interfaces

### `outbox_events` collection (`src/lib/db/models/OutboxEvent.ts`)

```typescript
export interface IOutboxEvent {
  type: "click";
  shortCode: string;
  timestamp: Date;
  referrer: string | null;
  userAgent: string | null;
  processed: boolean;
}
```

```typescript
const OutboxEventSchema = new Schema<IOutboxEvent>({
  type: { type: String, required: true, default: "click" },
  shortCode: { type: String, required: true },
  timestamp: { type: Date, required: true, default: Date.now },
  referrer: { type: String, default: null },
  userAgent: { type: String, default: null },
  processed: { type: Boolean, required: true, default: false },
});

OutboxEventSchema.index({ processed: 1, timestamp: 1 });
```

The compound index on `{ processed: 1, timestamp: 1 }` is what Phase 3's drain query (`find({ processed: false }).sort({ timestamp: 1 }).limit(N)`) will use — created now since the collection and its access pattern already exist, per the master spec's Phase 2 checklist.

`type: "click"` is a literal today (this is the only event type this build produces), kept as a real field rather than assumed implicitly — it costs nothing and documents the outbox as a general mechanism rather than a click-specific one, which is a reasonable thing to point out in an interview even though nothing else uses it yet.

### Service (`src/lib/services/outboxService.ts`)

```typescript
export async function recordClickEvent(
  shortCode: string,
  request: { referrer: string | null; userAgent: string | null },
): Promise<void>;
```

Internally: `OutboxEvent.create({ shortCode, referrer: request.referrer, userAgent: request.userAgent })` (`type` and `processed` take their schema defaults). Takes a small plain object instead of the raw `NextRequest` so the unit test doesn't need to construct a fake Next.js request — the route handler is responsible for pulling `referer`/`user-agent` off `request.headers` and passing them in.

---

## 3. Redirect route changes (`src/app/[shortCode]/route.ts`)

Current order (Phase 1): look up link → 404 or redirect.

New order:

1. Look up link via `findLinkByShortCode` (unchanged).
2. Not found → 404 (unchanged; no outbox event for a miss — there's no click to record if there's nothing to redirect to).
3. Found → call `recordClickEvent(shortCode, { referrer, userAgent })`, **awaited**, before constructing the redirect response.
4. Return the 301 redirect (unchanged).
5. Basic instrumentation: log the outbox-insert duration on each request (a `console.log` with a timing delta, in the same style already used in `connect.ts`'s cached-connection logging), so the added latency is directly observable in dev/Vercel logs rather than only inferred from end-to-end curl timing.

---

## 4. Confirmation of fixed decisions vs. open questions

### Already fixed (not reopened)

- Outbox pattern over fire-and-forget — fixed, documented in `DECISIONS.md` (Phase 0 section).
- No draining/aggregation logic in this phase — fixed, explicitly Phase 3's job. This phase only ever writes to `outbox_events`, never reads from it.
- The redirect itself stays a 301, unchanged from Phase 1.

### Open questions

1. **What happens if the outbox insert fails?** The spec says "insert one `outbox_events` document, **then** send the redirect response" — read literally, the insert is a required step before responding. But if Atlas has a transient hiccup on that one write, should the user's redirect fail too (a `500` instead of reaching their destination), or should the redirect still succeed with the failure only logged? I recommend: **catch the outbox-insert error, log it server-side, and still redirect the user** — losing one analytics event to a rare transient DB error is an acceptable, bounded cost, whereas making every redirect's success depend on a second write to the same database (beyond the read that already happened) measurably increases the redirect's failure surface for the sake of analytics, which contradicts the master spec's own framing that "the redirect itself is not blocked waiting on any heavier processing." **Confirm this, or prefer strict (outbox failure = redirect failure).**

2. **Referrer/user-agent capture on `NextRequest`** — these will be read via `request.headers.get("referer")` and `request.headers.get("user-agent")` (both nullable if absent, e.g. direct navigation with no referrer, or a bot/tool that omits UA). No open question here, just noting the exact source since the master spec's schema names the fields `referrer`/`userAgent` (not the HTTP header's actual spelling `referer`) — the mapping is worth being explicit about.

3. **Latency measurement method** — I'll add a `console.log` timing line around the outbox insert (visible in `next dev` output and in Vercel's function logs after deploy), and separately re-run the same manual curl-based latency check from Phase 1 (single redirects, warm connection) to get a comparable before/after number for `DECISIONS.md`. No separate benchmarking tool/script needed at this scale. **Confirm this is sufficient, or want a small repeated-request script for a more statistically solid number (e.g. average of 20 requests)?**

---

## 5. Review checkpoint (restated as concrete acceptance criteria)

Phase 2 is done when:

- [ ] Every successful redirect produces exactly one new `outbox_events` document (verified by checking the collection count before/after a redirect).
- [ ] A burst of concurrent redirects to the same and different short codes produces exactly one outbox event per request — no events lost, no duplicates (tested the same way Phase 1 tested concurrent creates).
- [ ] Redirect latency with the outbox write in place is measured and compared against the Phase 1 baseline (~20-50ms locally); the increase is small (expected: roughly one extra small insert's worth, likely single-digit-to-low-double-digit ms locally) and the result is logged in `DECISIONS.md`.
- [ ] The `{ processed: 1, timestamp: 1 }` index exists on `outbox_events` (checked via `explain()` or Atlas's index list) — not required to matter yet since nothing queries it until Phase 3, but confirmed present.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` (including the new `outboxService.test.ts`) all pass; CI green.
- [ ] A 404 (nonexistent short code) does **not** produce an outbox event.

---

**Please confirm open question 1 (outbox-failure handling) before I begin implementation** — 2 and 3 are mostly informational but flag if you'd rather I take a different approach on either.
