# Phase 4 — Rate Limiting & Abuse Prevention

## Goal (restated from master spec)

Protect `POST /api/links` from abuse using a MongoDB-backed rate limiter (no Redis, per the fixed project decision) — a `rate_limits` collection keyed by IP, with a TTL index to auto-expire old windows. Return proper `429` responses with a `Retry-After` hint when the limit is exceeded.

---

## 1. File / folder structure to be created or modified

```
src/
├── lib/
│   ├── db/
│   │   └── models/
│   │       └── RateLimit.ts          # new: rate_limits schema, TTL index
│   ├── services/
│   │   └── rateLimitService.ts       # new: checkRateLimit() — atomic counter logic
│   ├── http/
│   │   └── getClientIp.ts            # new: extract the caller's IP from request headers
│   └── api/
│       └── errors.ts                 # modified: apiError() gains an optional headers param
└── app/
    └── api/
        └── links/
            └── route.ts               # modified: rate-limit check before validation/creation
tests/
└── rateLimitService.test.ts           # new: unit tests for the counter/window logic
```

---

## 2. Schema / types / interfaces

### `rate_limits` collection (`src/lib/db/models/RateLimit.ts`)

```typescript
export interface IRateLimit {
  key: string; // `${identifier}:${windowStartMs}`, e.g. "create-link:203.0.113.4:1728950400000"
  count: number;
  expiresAt: Date; // end of this window; TTL index auto-deletes the doc once passed
}
```

```typescript
const RateLimitSchema = new Schema<IRateLimit>(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { collection: "rate_limits" },
);
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

### `rateLimitService.ts`

```typescript
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult>;
```

**Fixed-window counter, made race-free by a single atomic upsert-increment** — no read-then-write:

1. `windowStart = Math.floor(Date.now() / windowMs) * windowMs` — the current window's start, shared by every request that lands in the same window.
2. `key = "${identifier}:${windowStart}"`.
3. One atomic call: `RateLimit.findOneAndUpdate({ key }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + windowMs) } }, { upsert: true, new: true })`. MongoDB's `$inc` on an upsert is atomic — concurrent requests in the same window can't race each other into under-counting, unlike a "read count, check, write count+1" pattern would.
4. `allowed = doc.count <= limit`; `remaining = max(0, limit - doc.count)`; `retryAfterSeconds` computed from how much of the current window is left.

The TTL index on `expiresAt` (`expireAfterSeconds: 0`, i.e. "expire exactly at the stored timestamp") means MongoDB itself garbage-collects each window's counter document shortly after that window ends — the `rate_limits` collection never accumulates history, with no cleanup code needed.

### `getClientIp.ts`

Reads `x-forwarded-for` (Vercel populates this; take the first, left-most address — the original client), falling back to `x-real-ip`, falling back to the literal string `"unknown"` if neither is present (e.g. local dev without a proxy in front) — `"unknown"` still works correctly as a rate-limit bucket, it just means all direct-localhost traffic shares one bucket, which is fine for local testing.

### `apiError()` change

Add an optional 4th parameter for extra headers (needed to attach `Retry-After` on the `429`), defaulting to none — existing call sites are unaffected.

---

## 3. Route change (`POST /api/links`)

New first step, before body parsing/validation:

1. `const ip = getClientIp(request);`
2. `const result = await checkRateLimit(\`create-link:${ip}\`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);`
3. If `!result.allowed`: return `429` via `apiError(429, "RATE_LIMITED", "Too many links created. Please try again shortly.", { "Retry-After": String(result.retryAfterSeconds) })`.
4. Otherwise proceed exactly as today (validate → `createLink` → respond).

This runs _before_ validation/DB link-creation work, so an abusive caller's requests are turned away cheaply rather than after already doing the more expensive dedupe lookup — though note the rate-limit check itself is one DB round-trip, so it's not free; it's just cheaper than the full create path.

---

## 4. Confirmation of fixed decisions vs. open questions

### Already fixed (not reopened)

- MongoDB-backed, no Redis — fixed by the project's core architecture.
- Applies to `POST /api/links` only (not the redirect or process-outbox routes) — fixed by the master spec's own scope for this phase.
- `429` with a `Retry-After` hint on rejection — fixed by the master spec.

### Open questions

1. **Rate limit numbers.** I'm proposing **10 requests per 60-second window, per IP**. This is a guess calibrated for "generous enough that normal manual use never trips it, tight enough that a quick scripted burst clearly demonstrates the block during review." Easy to change either number — **confirm these, or give me different ones.**

2. **Fixed window vs. sliding window.** The master spec explicitly allows either. I'm proposing **fixed window** (as designed above) over a sliding-window log or sliding-window counter, because it's the simplest to implement correctly and reason about with a single atomic MongoDB upsert, and its known weakness — a caller can send up to `2×limit` requests in a short burst straddling a window boundary (limit at the tail of one window, limit again at the head of the next) — is a well-understood, explainable tradeoff rather than a hidden bug. I'll log this weakness explicitly in `DECISIONS.md` alongside what a sliding-window counter would cost in extra complexity. **Confirm fixed window, or would you rather I implement a sliding-window counter (roughly: weight the previous window's count by how much of it overlaps the current moment) for tighter accuracy?**

3. **Optional self-referential URL blocklist.** The master spec calls out "optional: basic URL validation/blocklist to avoid obvious abuse (e.g., shortening malicious domains)" as something this phase _may_ add. A maintained blocklist of malicious domains is out of scope (that's a whole subsystem/data-feed problem on its own), but one narrow, cheap check is directly relevant here: **rejecting an attempt to shorten a URL that points back at this app's own short-link domain**, which would otherwise let someone create a redirect loop (short link A → short link B → short link A). This weirdness isn't currently prevented by anything in the code. I'd like your call on whether to add it in this phase (it's a small, self-contained validation check, consistent in spirit with Phase 1's `javascript:`/`data:` scheme restriction) or explicitly skip it and leave abuse-prevention scoped to just rate limiting for now. **Add the self-referential check, or skip it this phase?**

---

## 5. Review checkpoint (restated as concrete acceptance criteria)

Phase 4 is done when:

- [ ] Sending requests to `POST /api/links` up to the configured limit all succeed normally.
- [ ] The next request within the same window returns `429` with a `RATE_LIMITED` error code and a `Retry-After` header containing a sane number of seconds.
- [ ] After the window elapses, requests succeed again (verified either by waiting out a real window, or by testing the service directly with a short window value).
- [ ] Two different IPs are rate-limited independently (one hitting its limit doesn't affect the other).
- [ ] The `rate_limits` collection's TTL index is confirmed present in Atlas; a window's counter document is confirmed to disappear after its `expiresAt` passes (TTL cleanup runs on MongoDB's own background sweep, typically within ~60s of expiry, not necessarily instant — this will be noted rather than asserted as sub-second).
- [ ] `npm run lint`, `npm run typecheck`, `npm test` (including the new `rateLimitService.test.ts`) all pass; CI green.
- [ ] `DECISIONS.md` documents the fixed-window choice, its boundary-burst tradeoff, and the Redis-backed-limiter comparison the master spec asks for.

---

**Please answer the three open questions above (rate limit numbers, fixed vs. sliding window, and the optional self-referential URL check) before I begin implementation.**
