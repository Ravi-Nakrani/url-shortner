# Phase 6 — Analytics Dashboard (Pure Read)

## Goal (restated from master spec)

Visualize the aggregated click data Phase 3 already produces (`click_stats`, `referrer_stats`) — clicks over time, top referrers, and a per-link breakdown — through a read path that is completely decoupled from outbox draining. This page never queries `outbox_events` and never triggers or waits on a drain; it only reads whatever the scheduler has already aggregated, and honestly surfaces "data current as of [last drain time]" so the eventual-consistency tradeoff is visible rather than hidden.

---

## 0. Design plan addition (the one screen the original Phase 1 design plan deferred)

Phase 1's design plan covered the create screen only, explicitly deferring the analytics dashboard's layout to "Phase 5/6." This phase fills that gap, using the same token system established since Phase 1 — no new palette, no card-shadow treatment.

- **Layout**: a single column, wider than the create form's 480px (roughly 720px), in three stacked sections: (1) a small muted-text freshness note ("Data current as of ...") at the top, (2) the clicks-over-time chart in a flat bordered block (same visual language as `ShortLinkResult`'s panel), (3) top referrers and the per-link breakdown table below, stacked on mobile / side-by-side on wider screens.
- **Color**: the chart's primary series uses the existing `--accent` token — no new "dashboard palette" bolted on. Before writing the chart component, I'll consult the `dataviz` skill (available in this environment) for how to extend a single accent color into a small, accessible categorical set if the top-referrers view needs to distinguish multiple bars/segments, while keeping the app's established warm-paper/muted-teal identity rather than defaulting to a generic chart-library palette.
- **Principle**: this page is read-only and honest about staleness — the freshness note isn't a footnote, it's the first thing on the page, because pretending the data is real-time would misrepresent how the system actually works.

---

## 1. File / folder structure to be created or modified

```
src/
├── app/
│   ├── api/
│   │   └── analytics/
│   │       └── route.ts              # new: GET /api/analytics — auth required, reads-only
│   └── dashboard/
│       └── analytics/
│           └── page.tsx               # new: the analytics page (server component, direct service call)
├── components/
│   └── analytics/
│       ├── ClicksOverTimeChart.tsx    # new: client component chart
│       ├── TopReferrersList.tsx       # new: simple ranked list
│       └── LinkBreakdownTable.tsx     # new: per-link totals table
└── lib/
    ├── db/
    │   └── models/
    │       └── DrainMeta.ts           # new: singleton doc tracking when the drain last ran
    └── services/
        └── analyticsService.ts        # new: getAnalyticsForUser() — the aggregation queries
tests/
└── analyticsService.test.ts           # new: unit tests for the aggregation-shaping logic
```

Also touches Phase 3's `outboxDrainService.ts` (a small addition, not a behavior change): it records `lastDrainedAt` in `DrainMeta` after each invocation, so this phase's freshness note has something real to read.

Following Phase 5's existing pattern (`/dashboard/page.tsx` fetches via a direct service call for its initial server-rendered data, while `GET /api/links` exists separately for the same read via a REST endpoint): the analytics page does the same — a fast, waterfall-free SSR fetch via `analyticsService` directly, plus a matching `GET /api/analytics` REST route for API completeness, per the master spec's literal wording ("dashboard API route").

---

## 2. Schemas / types / interfaces

### `DrainMeta` (`src/lib/db/models/DrainMeta.ts`)

```typescript
export interface IDrainMeta {
  _id: string; // singleton: always "last_drain"
  lastDrainedAt: Date;
  processedCount: number; // the most recent invocation's processedCount (may be 0)
}
```

Updated via `findOneAndUpdate({ _id: "last_drain" }, { $set: { lastDrainedAt: new Date(), processedCount } }, { upsert: true })` at the end of **every** `drainOutbox()` call — including empty-backlog no-ops. This is deliberate: if `lastDrainedAt` only updated on non-empty runs, a fully-caught-up system (the normal steady state) would show an increasingly stale-looking timestamp purely because there was nothing new to process, which would misrepresent a healthy system as a lagging one. Updating on every invocation instead answers the honest question "when did the system last check," which is what a freshness indicator should mean.

### `analyticsService.ts`

```typescript
export interface DailyClicks {
  date: string; // "YYYY-MM-DD"
  clicks: number;
}

export interface ReferrerBreakdown {
  referrer: string;
  clicks: number;
}

export interface LinkBreakdown {
  shortCode: string;
  longUrl: string;
  totalClicks: number;
}

export interface AnalyticsSummary {
  clicksOverTime: DailyClicks[]; // last 30 days, zero-filled for days with no data
  topReferrers: ReferrerBreakdown[]; // top 5, aggregated across all the user's links
  linkBreakdown: LinkBreakdown[]; // every owned link, sorted by totalClicks desc
  lastDrainedAt: string | null; // ISO string, or null if the drain has never run
}

export async function getAnalyticsForUser(userId: string): Promise<AnalyticsSummary>;
```

Internally:

1. `Link.find({ userId }).select("shortCode longUrl")` — the set of short codes this analytics view is scoped to (unowned/anonymous links are never included, consistent with Phase 5's ownership model).
2. `ClickStats.aggregate([{ $match: { shortCode: { $in: shortCodes }, date: { $gte: cutoffDate } } }, { $group: { _id: "$date", clicks: { $sum: "$clicks" } } }, { $sort: { _id: 1 } }])` for the 30-day time series, then zero-fill any missing dates in JS before returning (so the chart doesn't show gaps as absent data rather than zero clicks).
3. `ClickStats.aggregate([{ $match: { shortCode: { $in: shortCodes } } }, { $group: { _id: "$shortCode", totalClicks: { $sum: "$clicks" } } }])` for the per-link breakdown, merged with each link's `longUrl` from step 1.
4. `ReferrerStats.aggregate([{ $match: { shortCode: { $in: shortCodes } } }, { $group: { _id: "$referrer", clicks: { $sum: "$count" } } }, { $sort: { clicks: -1 } }, { $limit: 5 }])` for top referrers.
5. `DrainMeta.findById("last_drain")` for the freshness timestamp.

**No new indexes needed for the `$match` stages** — Phase 3's existing compound indexes (`{shortCode:1, date:1}` unique on `ClickStats`, `{shortCode:1, date:1, referrer:1}` unique on `ReferrerStats`) already cover matching by `shortCode` (via `$in`, which MongoDB can still use an index for) and range-filtering by `date`. This gets verified directly in this phase's checkpoint via `.explain()`.

### `GET /api/analytics`

1. `const session = await auth();` — no session → `401`.
2. `connectToDatabase()`, call `getAnalyticsForUser(session.user.id)`, return it as JSON.

---

## 3. Confirmation of fixed decisions vs. open questions

### Already fixed (not reopened)

- Reads only from `click_stats`/`referrer_stats` — never touches `outbox_events`, never triggers a drain. Fixed by the master spec; this is the phase's entire point.
- Scoped to the signed-in user's own links only (anonymous/unowned links have no analytics view) — a direct consequence of Phase 5's ownership model, not something this phase reopens.
- "Data current as of [last drain time]" must be visibly surfaced — fixed by the master spec.

### Open questions

1. **Charting library.** I'm proposing **Recharts** for the clicks-over-time chart — it's the standard choice for exactly this (a line/bar chart in a React app), integrates cleanly as a client component, and is a normal, well-understood dependency to name in an interview rather than either overkill (a full dashboarding framework) or underpowered (hand-rolled SVG math). The alternative is a small hand-rolled inline SVG chart with zero new dependencies — more code to write and maintain, but nothing to install. **Confirm Recharts, or prefer the dependency-free inline SVG approach?**

2. **Time range and top-referrer count.** Proposing a fixed **last 30 days** for the clicks-over-time chart (no date-range picker — out of scope, easy to add later) and **top 5** referrers. **Confirm these numbers, or adjust.**

3. **Freshness display format.** Proposing an absolute local timestamp ("Data current as of 9:32 AM") rather than a relative one ("3 minutes ago") — relative-time text risks a server/client rendering mismatch in React (the server renders one relative value, then the client re-renders a slightly different one a moment later) unless handled carefully, and an absolute timestamp sidesteps that entirely for no real loss of usefulness. This is a small enough implementation detail that I'll just proceed with it unless you'd rather see relative time.

---

## 4. Review checkpoint (restated as concrete acceptance criteria)

Phase 6 is done when:

- [ ] The analytics page renders clicks-over-time, top referrers, and a per-link breakdown for a signed-in user's own links, with real numbers matching what's actually in `click_stats`/`referrer_stats`.
- [ ] The "Data current as of ..." note shows a real, correct timestamp from `DrainMeta`, and updates after the next scheduled drain runs.
- [ ] **Read latency is independent of outbox backlog size** — verified concretely by seeding a large unprocessed backlog directly into `outbox_events` (as done in Phase 3's checkpoint) and confirming the analytics page's response time is unaffected, since its queries never touch that collection at all.
- [ ] `.explain()` on the aggregation queries against real Atlas data confirms index usage (`IXSCAN`, not `COLLSCAN`) — logged in `DECISIONS.md`.
- [ ] A user with no click data yet sees a sensible empty state, not an error or a blank crash.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` (including the new `analyticsService.test.ts`) all pass; CI green.
- [ ] The page is responsive down to mobile width and uses only existing design tokens — no new hardcoded colors.

---

**Please answer the open questions above (especially #1, the charting library) before I begin implementation.**
