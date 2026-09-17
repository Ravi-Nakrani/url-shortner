# Phase 0 — Foundations & Setup

## Goal (restated from master spec)

Stand up an empty-but-correct skeleton: a deployed Next.js app on Vercel, a working MongoDB Atlas connection using a serverless-safe cached-connection pattern, env var validation, base linting/formatting/CI scaffolding, a drafted `links` schema, and a documented short-code generation strategy. Nothing clever yet — no create/redirect logic (that's Phase 1).

---

## 1. File / folder structure to be created

```
url-shortner/
├── .github/
│   └── workflows/
│       └── ci.yml                  # lint + typecheck + test on push (drain workflow comes in Phase 3)
├── .husky/
│   └── pre-commit                  # runs lint-staged
├── src/
│   ├── app/
│   │   ├── layout.tsx              # root layout (minimal, theme CSS vars imported here)
│   │   ├── page.tsx                # placeholder home page
│   │   ├── globals.css             # CSS custom properties (design tokens) + Tailwind v4 @theme block
│   │   └── api/
│   │       └── health/
│   │           └── route.ts        # GET /api/health — proves DB connection works end-to-end
│   ├── lib/
│   │   ├── db/
│   │   │   ├── connect.ts          # cached/global Mongoose connection helper
│   │   │   └── models/
│   │   │       └── Link.ts         # Mongoose model + TypeScript interface for `links` collection
│   │   ├── env.ts                  # zod-validated env var schema, imported at startup
│   │   └── shortcode.ts            # short-code generation utility (pure function, unit-testable)
│   └── types/
│       └── (shared types as needed)
├── tests/
│   └── shortcode.test.ts           # unit test for short-code generation
├── .env.local.example              # documents required env vars (no real secrets)
├── .eslintrc.json / eslint.config.mjs  # Next.js recommended + TypeScript strict
├── .prettierrc
├── .lintstagedrc.json
├── tailwind.config.ts (or Tailwind v4 CSS-first config — decide in step below)
├── tsconfig.json                   # strict: true
├── package.json
├── DECISIONS.md                    # running design-decisions log (started here, added to every phase)
├── README.md                       # setup instructions (grows over phases)
└── PHASE_0.md                      # this file
```

No API routes for links/redirect yet — those are Phase 1. `/api/health` exists solely to prove the DB connection pattern works under repeated invocations, per this phase's review checkpoint.

---

## 2. Schemas / types / interfaces

### `links` collection (drafted now, used starting Phase 1)

```typescript
// src/lib/db/models/Link.ts
interface ILink {
  shortCode: string; // unique, indexed — e.g. "aZ3xK9"
  longUrl: string; // the destination URL
  createdAt: Date;
  userId: string | null; // nullable until Phase 5 auth lands
  expiresAt: Date | null; // nullable — optional expiry
}
```

Mongoose schema mirrors this with a unique index on `shortCode`:

```typescript
const LinkSchema = new Schema<ILink>({
  shortCode: { type: String, required: true, unique: true },
  longUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  userId: { type: String, default: null },
  expiresAt: { type: Date, default: null },
});
```

(`unique: true` builds a unique index — the actual collision-safety test happens in Phase 1's concurrent-request checkpoint, not this phase.)

### Env schema (`src/lib/env.ts`)

```typescript
const envSchema = z.object({
  MONGODB_URI: z.string().url(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});
```

Validated once at module load; throws a clear error immediately if misconfigured, rather than failing with an unclear error mid-request. More vars (e.g. `OUTBOX_SECRET`, `NEXTAUTH_SECRET`) get added to this schema in later phases as they're introduced — not speculatively now.

---

## 3. Decisions already fixed by the master spec (not reopened here)

- Next.js App Router, deployed on Vercel — fixed.
- MongoDB Atlas M0 via Mongoose, cached/global connection pattern — fixed.
- No Redis, no external queue — fixed.
- TypeScript strict mode, ESLint + Prettier via Husky/lint-staged, zod env validation, zod input validation on API routes — fixed, and set up starting this phase (not deferred).
- Tailwind CSS with all colors as CSS custom properties, no inline/hardcoded colors — fixed; base `globals.css` token scaffold is created in this phase (the actual palette/design plan is Phase 1's job, since Phase 1 is where the first real UI ships — see open question 3 below for what "base scaffold" means here).
- CI workflow (lint + typecheck + tests) separate from the later outbox-drain workflow — fixed, created in this phase since it should run "from Phase 0 onward."

## 4. Open questions (need an answer before/while implementing this phase)

1. **Short-code generation strategy** — the spec asks me to decide + document one of: base62 counter, random + collision check, or hash-based. My recommendation: **random 7-character base62 string + collision check on insert (catch the unique-index violation and retry)**. Reasoning: a counter requires a separate atomic-increment document (extra moving part, and leaks link ordering/volume); a hash of the URL means the same URL always maps to the same code (not always desired, and needs truncation + collision handling anyway); random + retry-on-collision is simple, stateless, has negligible collision probability at 7 chars (62^7 ≈ 3.5 trillion), and turns the _unique index itself_ into the collision guard rather than a separate check — a good interview talking point ("I let the DB's unique constraint be the source of truth for collision-freedom, not an app-level check-then-insert race"). **Confirm this before I write `shortcode.ts`.**

2. **Package manager** — npm, pnpm, or yarn? I'll default to **npm** (zero extra setup, universally available) unless you prefer pnpm/yarn.

3. **Tailwind version** — v3 (config-file based) or v4 (CSS-first `@theme`)? The spec gives instructions for both but v4 is current and simpler for the CSS-variable-driven theming this project wants. I'll default to **Tailwind v4**, with only a minimal placeholder token set in `globals.css` in this phase (e.g. background/foreground) — the _real_ design-token plan (palette, type, layout principles) is explicitly Phase 1's deliverable per the master spec ("before writing any UI code" for the first real screen), so Phase 0's `page.tsx` stays a bare placeholder, not a styled landing page. Confirm this sequencing is right.

4. **Test runner** — the spec says "basic automated tests... unit tests for core logic." I'll use **Vitest** (fast, native ESM/TS support, minimal config) rather than Jest. Confirm, or state a preference.

5. **MongoDB Atlas cluster** — this requires you to actually create a free M0 cluster in Atlas (an external account action I can't do for you) and give me the connection string for `.env.local`. I'll proceed with all the code assuming a `MONGODB_URI` env var exists; you'll need to supply the real one for the `/api/health` check to pass locally, and add it to Vercel's env vars for the deployed check. Let me know if you've already created one or want me to pause here for you to do so.

6. **Vercel deployment** — similarly, connecting the repo to Vercel and setting env vars there is an account action. I can prepare everything so `git push` → Vercel build works, but I can't create the Vercel project/link the GitHub repo myself. Do you want to do that step yourself once the code is ready, or walk through it together?

7. **Git repo** — this directory isn't a git repo yet. I'll run `git init` and make the initial commit(s) as part of this phase's implementation (small, scoped commits per the engineering standards) — confirming that's expected here since git is otherwise a "hard to reverse... visible to others" concern I'd normally check before touching.

---

## 5. Review checkpoint (restated as concrete acceptance criteria)

Phase 0 is done when:

- [ ] `npm run dev` starts the app locally with no errors.
- [ ] `GET /api/health` returns 200 and confirms a live MongoDB connection (and a second/third hit reuses the cached connection rather than opening a new one each time — verified via a log line showing "reusing cached connection" vs. "creating new connection").
- [ ] `npm run lint`, `npm run typecheck`, and `npm test` all pass, and are wired into `.github/workflows/ci.yml` so they run on every push.
- [ ] Husky pre-commit hook actually blocks a commit with lint/format violations (tested once manually).
- [ ] `src/lib/env.ts` throws a clear, immediate error if `MONGODB_URI` is missing/malformed — tested by temporarily unsetting it.
- [ ] The `links` Mongoose schema/interface exists (unused by routes yet) with a unique index on `shortCode`.
- [ ] `DECISIONS.md` documents the short-code generation strategy choice and alternatives rejected, with reasoning.
- [ ] The app is pushed to a GitHub repo and deployed on Vercel; the deployed `/api/health` route also successfully connects to Atlas (proving the connection pattern works in the actual serverless environment, not just locally).
- [ ] No colors/styling beyond a bare, unstyled placeholder page exist yet (real UI design work is explicitly deferred to Phase 1).

---

**Please review the open questions in section 4 (especially #1 short-code strategy, #3 Tailwind version/sequencing, and #5/#6 the external account actions) and confirm before I begin implementation.**
