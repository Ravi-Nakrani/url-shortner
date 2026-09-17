# Phase 1 — Core Create + Redirect Flow (MVP)

## Goal (restated from master spec)

A working shortener with no click tracking yet: `POST /api/links` to create a short link, `GET /[shortCode]` to redirect, a minimal frontend form, and graceful handling of short-code collisions. This is also where the UI design plan and CSS-variable theming get established, since every later screen builds on it.

---

## 0. Design plan (required before any UI code, per master spec)

### Concept

A URL shortener's actual "product" is the short link it hands back — that's the one thing the user is here to get and will copy/paste elsewhere. The UI's job is to get out of the way of _submitting_ a URL and then make the _resulting short link_ the unambiguous hero of the screen — not just another form field or table row.

### Color

Named tokens (defined as CSS custom properties in `globals.css`, resolved through Tailwind via `@theme`):

| Token                | Role                                   | Value (light)                                                                                                                                       |
| -------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--color-bg`         | page background                        | `#faf9f6` — a warm, slightly off-white paper tone (not stark white, not the common cream/terracotta combo)                                          |
| `--color-surface`    | card/input surface                     | `#ffffff`                                                                                                                                           |
| `--color-text`       | primary text                           | `#1c1c1e`                                                                                                                                           |
| `--color-text-muted` | secondary text (timestamps, hints)     | `#6b6b6f`                                                                                                                                           |
| `--color-accent`     | the short link itself, primary actions | `#1d5c4f` — a deep, muted teal/pine green. Chosen deliberately: not a default SaaS blue/indigo, not neon; reads as "tool," slightly technical, calm |
| `--color-danger`     | errors, destructive actions            | `#b3261e`                                                                                                                                           |
| `--color-border`     | hairline borders/dividers              | `#e4e2dc`                                                                                                                                           |

Dark mode redefines each under `prefers-color-scheme: dark` (e.g. `--color-bg: #14151a`, `--color-accent: #4fb8a0` — a lighter tint of the same teal family so the identity carries over rather than switching palettes).

### Type

- **UI/body text**: Keep the existing Geist Sans (already wired up by create-next-app via `next/font`) — clean, neutral, doesn't fight for attention.
- **The short link output**: a monospace typeface (Geist Mono, also already available) at a noticeably larger size than surrounding UI text. Treating the short link as _code/output_ rather than prose text reinforces that it's the artifact the tool produced — this is the one deliberate typographic distinction on the page.

### Layout

- **Create screen** (`/`): a single centered column, narrow (max ~480px) — one URL input and a submit button, nothing else competing for attention above the fold. On successful creation, the form's input area is replaced (not appended below) by a result panel: the short link in large monospace on an accent-tinted surface, a copy button beside it, and a small "shorten another" affordance to reset. This is the "short link as hero" moment — it should feel like the screen's climax, not a toast notification.
- **No link list / dashboard UI in this phase** — those are Phase 5/6. Phase 1's frontend is exactly the create flow described above.

### Principles

1. The short link is the product — it gets the largest type, the most contrast, and the only accent-colored surface on the page. Everything else (the input form, labels) stays quiet and neutral so the result reads as a payoff.
2. Restrained motion: exactly one transition worth having in this phase — the copy button's state change (e.g. label flips to "Copied" briefly). No hover-lift cards, no entrance animations, no gradient accents.

### Genericness check

- Off-white/near-black-and-neon and warm-cream/terracotta palettes are explicitly called out in the spec as defaults to avoid — the muted teal accent on warm-paper background avoids both.
- No rounded-corner-soft-shadow "card kit" treatment — the result panel is a flat, bordered block, not a floating card with a drop shadow.
- No tracked-out uppercase labels, no arrow glyphs appended to the submit button.

---

## 1. File / folder structure to be created or modified

```
src/
├── app/
│   ├── page.tsx                     # rewritten: the create-link form + result panel
│   ├── globals.css                  # rewritten: real color tokens per design plan above
│   ├── [shortCode]/
│   │   └── route.ts                 # GET /[shortCode] — redirect handler
│   └── api/
│       └── links/
│           └── route.ts             # POST /api/links — create handler
├── components/
│   ├── CreateLinkForm.tsx            # client component: input, submit, loading/error state
│   └── ShortLinkResult.tsx           # client component: the "hero" result panel + copy button
├── lib/
│   ├── validation/
│   │   └── links.ts                  # zod schema for POST /api/links request body
│   ├── services/
│   │   └── linkService.ts            # createLink() — generate code, insert, retry on collision
│   └── api/
│       └── errors.ts                 # shared API error response shape + helper
└── types/
    └── api.ts                        # shared request/response TypeScript types for /api/links
tests/
├── linkService.test.ts               # unit test: collision retry logic (mocked model)
└── validation.test.ts                # unit test: URL validation schema (valid/invalid cases)
```

Why a `route.ts` under `src/app/[shortCode]/` rather than a page: the redirect is a pure server-side HTTP redirect (301/302), not a rendered page — a Route Handler returning `NextResponse.redirect()` is the correct primitive, and it keeps this phase's redirect logic in the same style as `/api/health` and the Phase 2 outbox insert that will sit right beside it.

Why a `linkService.ts` separate from the route handler: per the master spec's "clear separation between API routes... and business logic (services)" — the route handler stays thin (parse request → call service → shape response), and the collision-retry loop becomes independently unit-testable without spinning up Next's request/response machinery.

---

## 2. Schemas / types / interfaces

### Request/response types (`src/types/api.ts`)

```typescript
export interface CreateLinkRequest {
  longUrl: string;
}

export interface CreateLinkResponse {
  shortCode: string;
  shortUrl: string; // fully-qualified, e.g. https://<host>/<shortCode>
  longUrl: string;
  createdAt: string; // ISO string
}

export interface ApiErrorResponse {
  error: {
    message: string;
    code: string; // e.g. "VALIDATION_ERROR", "NOT_FOUND", "INTERNAL_ERROR"
  };
}
```

### Validation schema (`src/lib/validation/links.ts`)

```typescript
export const createLinkSchema = z.object({
  longUrl: z.string().url({ message: "Please enter a valid URL, including https://" }).max(2048),
});
```

### Service layer (`src/lib/services/linkService.ts`)

```typescript
interface CreateLinkResult {
  shortCode: string;
  longUrl: string;
  createdAt: Date;
}

async function createLink(longUrl: string): Promise<CreateLinkResult>;
```

Internally:

1. `findOne({ longUrl })` — if a link already exists for this exact URL, return it as-is (no new code minted). This requires a non-unique index on `longUrl` (see resolved open question 4) so the lookup doesn't do a full collection scan.
2. On a miss, loop up to 5 attempts: generate a code via `generateShortCode()`, attempt `Link.create(...)`, catch Mongo's duplicate-key error (code `11000`) specifically and retry; any other error rethrows. Exhausting attempts throws a distinct error type so the route handler can return a 500 with a clear message rather than a silent infinite loop.

Note: steps 1 and 2 aren't wrapped in a transaction — a race between the `findOne` and the eventual `insert` (two requests submitting the same brand-new URL at the same instant) could in principle produce two different short codes for the same `longUrl`. This is an acceptable, documented tradeoff for this phase (the non-unique index means it wouldn't corrupt anything, just occasionally produce a duplicate mapping) rather than adding transaction complexity for a low-frequency edge case — worth being able to explain if asked.

### Error helper (`src/lib/api/errors.ts`)

A small helper (`apiError(status, code, message)`) that returns a `NextResponse.json(...)` matching `ApiErrorResponse`, used consistently across `/api/links` and `/[shortCode]` so error shape is uniform — per the master spec's "consistent error handling" standard. In production, unexpected/internal errors are logged server-side but the client only ever sees a generic message (no stack traces).

---

## 3. Route behavior

### `POST /api/links`

1. Parse and validate body with `createLinkSchema`; on failure, `400` with `VALIDATION_ERROR`.
2. Call `linkService.createLink(longUrl)`.
3. Return `201` with `CreateLinkResponse` (shortUrl built from the request's own host, or an env-configured base URL — see open question 3 below).
4. On service exhaustion/unexpected error, `500` with `INTERNAL_ERROR` (generic message, real error logged server-side).

### `GET /[shortCode]`

1. Look up `Link` by `shortCode`.
2. Not found → `404` (a simple text/JSON response is fine in this phase; a styled 404 page is not required by the checkpoint).
3. Found → `NextResponse.redirect(longUrl, 301)`. **Using 301 (permanent)**, since a given short code always maps to the same destination for its lifetime, which is the more semantically correct status and also more cacheable — matches the "well-defended decision" standard for the interview. (Open question 4 below asks you to confirm this over 302.)

   > **Later revised to 302** — this plan's reasoning about cacheability turned out to be
   > incomplete: it never considered that a browser-cached 301 means a returning
   > visitor's repeat clicks stop reaching the server at all, silently undercounting the
   > app's own click analytics. See [DECISIONS.md](DECISIONS.md#redirect-status-code-302-temporary-revised-from-an-earlier-301)
   > for the full reasoning behind the reversal. Kept here rather than edited away,
   > since getting this wrong first and correcting it later is a more honest record than
   > pretending the plan always said 302.

4. `expiresAt` check: if set and in the past, treat as not found (`404`) rather than redirecting — this is a natural fit here since the field already exists on the schema, even though full expiry _management_ UI isn't built until Phase 5.

---

## 4. Confirmation of fixed decisions vs. open questions

### Already fixed (not reopened)

- Next.js App Router / Mongoose / MongoDB Atlas — fixed, in place since Phase 0.
- Short-code generation = random base62 + collision retry via unique index — fixed and documented in `DECISIONS.md`; this phase is where it's actually wired into a real insert path for the first time.
- No click tracking / outbox in this phase — fixed, explicitly deferred to Phase 2.
- Zod validation on the API route, consistent error shape, TypeScript strict — fixed, engineering standards apply now.
- CSS-variable-only theming, no inline/hardcoded colors — fixed; this phase produces the first real token set per the design plan above.

### Open questions (need your answer before implementation starts)

1. **301 vs 302 redirect** — I'm proposing **301 (permanent)** per the reasoning above. The tradeoff: 301s get cached by browsers, so if a link's destination is ever _edited_ later (Phase 5 lets users edit an alias — though editing the destination URL isn't explicitly in the spec), a cached 301 could keep sending users to the old destination. Since links are otherwise immutable in this design, I think 301 is right and is a good interview talking point either way (explaining the cacheability/mutability tradeoff). **Confirm 301, or prefer 302 for safety.**

2. **Short link base URL** — for `shortUrl` in the response and for what the UI displays/copies, do I derive the host from the incoming request (works automatically on any domain, including Vercel preview URLs) or from an explicit env var (e.g. `NEXT_PUBLIC_BASE_URL`)? I recommend **deriving from the incoming request's host** for this phase (zero extra config, works identically on localhost/preview/production) and revisiting if a custom domain is added later. **Confirm.**

3. **Collision retry max attempts** — proposing **5 attempts** before giving up and returning a 500 (at 7-char base62, needing even a second retry should be astronomically rare — 5 is generous headroom, not a real expected path). **Confirm this number is fine, or adjust.**

4. **Duplicate submission of the same long URL** — **Resolved: return the existing short code if one already exists for that `longUrl`**, rather than minting a new one. `linkService.createLink` will first `findOne({ longUrl })` and return it if present, only generating+inserting a new code on a miss. This means an index on `longUrl` is worth adding alongside the existing unique index on `shortCode` (a plain, non-unique index — multiple _different_ long URLs never collide with each other, but the lookup itself should be indexed rather than an unindexed collection scan). Note this is a global, anonymous-scope dedupe in this phase (no `userId` yet), so two different visitors submitting the same URL get the same short code — that's consistent with today's scope where all links are ownerless. This gets revisited once Phase 5 auth introduces per-user ownership (the dedupe would then plausibly become per-user, not global — noted here rather than silently decided later).

5. **URL validation strictness** — beyond `z.string().url()`, should Phase 1 block obviously-dangerous schemes (e.g. `javascript:`, `data:`) explicitly, or is that acceptable to defer to Phase 4's "optional basic URL validation/blocklist"? `z.string().url()` via the WHATWG URL parser will accept `javascript:alert(1)` as a syntactically valid URL, and since `GET /[shortCode]` performs a server-issued redirect (not client-side navigation), this isn't an XSS vector against this app itself — but it would make this shortener a usable _open redirect_ to a dangerous scheme for whoever clicks the short link. I recommend **restricting to `http:`/`https:` schemes only in this phase's validation schema** (a two-line check, not the fuller abuse-prevention work Phase 4 owns) rather than deferring entirely. **Confirm this small scope addition, or explicitly defer it to Phase 4.**

---

## 5. Review checkpoint (restated as concrete acceptance criteria)

Phase 1 is done when:

- [ ] `POST /api/links` with a valid URL returns `201` with a working short code; invalid URL returns `400` with a clear validation error.
- [ ] `GET /[shortCode]` for an existing code redirects (verified via `curl -i`, checking the status code and `Location` header); for a nonexistent code returns `404`.
- [ ] A quick concurrent-request test (e.g. firing several creates in parallel, or manually forcing a collision) confirms the unique index + retry logic actually prevents duplicate short codes rather than erroring out.
- [ ] The frontend form creates a link and displays the result per the design plan (short link as the visually dominant element, monospace, accent surface), with a working copy-to-clipboard button.
- [ ] No hardcoded/inline colors anywhere in the new UI code — every color resolves through a CSS variable token defined in `globals.css`.
- [ ] Baseline redirect latency is noted (for comparison against Phase 2's outbox-insert overhead and Phase 7's Edge migration).
- [ ] `npm run lint`, `npm run typecheck`, and `npm test` (including the two new test files) all pass; CI is green.
- [ ] Responsive at mobile width, visible keyboard focus states on the input/button, and the app respects `prefers-reduced-motion` for the one copy-confirmation transition.

---

**Please answer the five open questions above (especially #1 redirect status code and #5 scheme restriction) before I begin implementation.**
