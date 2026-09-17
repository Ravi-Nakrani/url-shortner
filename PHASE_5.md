# Phase 5 — Auth & Per-User Link Management

## Goal (restated from master spec)

Move from anonymous-only links to a real per-user experience: NextAuth.js integration, real link ownership (the `userId` field already exists on the schema but has always been `null`), and a "My Links" dashboard where a logged-in user can list, edit the alias, set expiry, and delete their own links — with ownership enforced so no one can touch another user's links.

---

## 1. File / folder structure to be created or modified

```
src/
├── auth.ts                                # new: NextAuth config — provider, session strategy, exports
├── middleware.ts                          # new: protects /dashboard, redirects unauthenticated visitors
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts                # new: NextAuth's catch-all route handler
│   │   └── links/
│   │       ├── route.ts                    # modified: POST attaches userId when signed in; new GET lists the current user's links
│   │       └── [shortCode]/
│   │           └── route.ts                # new: PATCH (alias/expiry) and DELETE, ownership-enforced
│   ├── dashboard/
│   │   └── page.tsx                        # new: "My Links" page (server component)
│   └── layout.tsx                          # modified: adds a persistent sign-in/out header
├── components/
│   ├── AuthStatus.tsx                      # new: sign-in/sign-out control in the header
│   ├── LinkList.tsx                        # new: the dashboard's list, owns edit/delete interaction state
│   └── LinkListItem.tsx                    # new: one row — shortCode, longUrl, dates, inline edit/delete
└── lib/
    ├── db/
    │   └── models/
    │       └── Link.ts                     # modified: add index on { userId: 1, createdAt: -1 }
    ├── services/
    │   └── linkService.ts                  # modified/extended: owner-scoped dedupe, updateLink(), deleteLink(), listLinksForUser()
    └── validation/
        └── links.ts                        # extended: schema for PATCH (alias format, expiresAt)
tests/
├── linkService.test.ts                     # extended: ownership checks, owner-scoped dedupe, alias collision
└── validation.test.ts                      # extended: alias/expiry validation cases
```

NextAuth's own auth flow (OAuth redirect, callback, cookie/session handling) isn't practically unit-testable outside its own runtime — that's verified manually via this phase's review checkpoint ("auth flow works end-to-end"), not via `tests/`. Unit tests stay scoped to the business logic layered on top: ownership checks, owner-scoped dedupe, and the new validation rules.

---

## 2. Schemas / types / interfaces

No new fields on `Link` — the schema was already fixed in Phase 0 with `userId: string | null` for exactly this phase. This phase starts actually populating it and adds one index:

```typescript
LinkSchema.index({ userId: 1, createdAt: -1 }); // backs the "my links" list query
```

### `linkService.ts` changes

```typescript
// createLink's dedupe becomes owner-scoped (see open question 3)
export async function createLink(longUrl: string, userId: string | null): Promise<CreateLinkResult>;

export interface UpdateLinkInput {
  shortCode?: string; // new alias, if being changed
  expiresAt?: Date | null;
}

export async function updateLink(
  currentShortCode: string,
  userId: string,
  updates: UpdateLinkInput,
): Promise<CreateLinkResult>;
// throws NotFoundError if no link with currentShortCode is owned by userId
// throws AliasTakenError (mapped from Mongo's 11000) if the new shortCode collides

export async function deleteLink(shortCode: string, userId: string): Promise<void>;
// throws NotFoundError if no link with shortCode is owned by userId

export async function listLinksForUser(userId: string): Promise<CreateLinkResult[]>;
// sorted by createdAt desc; no pagination at this project's scale
```

### Validation additions (`links.ts`)

```typescript
export const aliasSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message: "Alias can only contain letters, numbers, hyphens, and underscores",
  });

export const updateLinkSchema = z.object({
  shortCode: aliasSchema.optional(),
  expiresAt: z.string().datetime().nullable().optional(), // ISO string from the client, or null to clear
});
```

### New route: `PATCH` / `DELETE` `/api/links/[shortCode]`

1. `const session = await auth();` — no session → `401`.
2. Parse/validate the body (`updateLinkSchema`) for `PATCH`.
3. Call `updateLink`/`deleteLink` with `session.user.id`; a `NotFoundError` (link doesn't exist _or_ isn't owned by this user — indistinguishable on purpose, see open question 4) → `404`; an `AliasTakenError` → `409`.

### Modified route: `POST` / `GET` `/api/links`

- `POST`: reads the session (if any) and passes `session?.user?.id ?? null` into `createLink`, so signed-in users' links are owned and anonymous creation still works exactly as before.
- `GET` (new): requires a session (`401` if none); returns `listLinksForUser(session.user.id)`.

---

## 3. Confirmation of fixed decisions vs. open questions

### Already fixed (not reopened)

- `Link`'s schema fields (`shortCode`, `longUrl`, `createdAt`, `userId`, `expiresAt`) — fixed since Phase 0; nothing new is added.
- NextAuth.js as the auth library — fixed by the master spec.
- "List, edit alias, set expiry, delete" is the exact scope of dashboard functionality — fixed by the master spec. Editing the _destination_ `longUrl` is explicitly **not** in scope (the spec's Phase 5 checklist never mentions it), so `PATCH` only ever touches `shortCode` and `expiresAt`.

### Open questions

1. **Provider and session strategy — the biggest decision in this phase.** I'm proposing:
   - **GitHub OAuth as the sole provider** (fits a URL-shortener/dev-tool's audience, and is the simplest OAuth setup — one app registration, no consent-screen review process like Google requires).
   - **JWT session strategy, no database adapter.** NextAuth can optionally persist users/sessions to a database via an adapter (e.g. `@auth/mongodb-adapter`), which would add four new auto-managed collections (`users`, `accounts`, `sessions`, `verification_tokens`) and — critically — requires a _second_, separate MongoDB connection: the official adapter needs a raw native `MongoClient`, not the Mongoose connection this project uses everywhere else. A JWT-strategy session needs none of that: the session lives entirely in a signed cookie, `link.userId` is simply the GitHub account's id, and the whole app keeps talking to MongoDB through the one existing Mongoose connection. The cost: no server-side session revocation (can't force-logout a user without changing the app's secret) and no queryable `Users` collection — both reasonable to give up at this project's scale, and worth being able to name explicitly as "what I'd add if this needed instant revocation."

   **Confirm GitHub OAuth + JWT sessions (no adapter), or would you rather add database-persisted sessions (accepting a second Mongo client), or use a different provider (Google, email magic link, credentials)?**

2. **Anonymous link creation stays allowed.** The homepage's create form keeps working with no login wall — signed-in users' links simply get `userId` attached automatically (and then show up in their dashboard); anonymous links keep `userId: null` and are permanently unmanageable via the dashboard (no one owns them). **Confirm, or should creating a link require being signed in from this phase forward?**

3. **Resolving Phase 1's deferred dedupe question: owner-scoped, not global.** Currently, submitting a `longUrl` that's already been shortened by _anyone_ returns that existing code. This phase changes the dedupe check from `{ longUrl }` to `{ longUrl, userId }` — so a signed-in user resubmitting a URL they've already shortened gets their own existing link back (no dashboard clutter), but a different user (or an anonymous visitor) shortening the same URL gets their own independent new code. This was explicitly flagged as an open question back in `DECISIONS.md`'s Phase 1 section for exactly this phase to resolve. **Confirm this resolution.**

4. **404, not 403, when acting on a link you don't own.** `PATCH`/`DELETE` on a `shortCode` that either doesn't exist or belongs to someone else returns the same `404 NOT_FOUND` in both cases, rather than a `403 Forbidden` that would confirm "this shortCode exists, you just can't touch it." **Confirm this indistinguishable-404 approach, or prefer explicit 403 for owned-by-someone-else.**

5. **Deletes are not cascaded to analytics.** Deleting a link removes only the `Link` document; any `outbox_events`/`click_stats`/`referrer_stats` rows already recorded for that `shortCode` are left as-is rather than cascade-deleted. Reasoning: historical click data arguably should persist as a record even after the link itself is removed (similar to how analytics tools generally don't erase history when a campaign/link is archived), and cascade-deleting adds real complexity (multi-collection deletes, plus what happens to _unprocessed_ outbox events for a shortCode whose link just vanished) for a low-value edge case at this project's scale. **Confirm keep-analytics-on-delete, or prefer cascade delete.**

6. **Alias validation rule**: proposing `^[a-zA-Z0-9_-]{3,30}$` (letters, digits, hyphens, underscores; 3-30 characters) for user-chosen aliases — friendlier and more flexible than the system-generated 7-character random base62 codes, matching how most link shorteners let people pick memorable custom slugs. **Confirm, or adjust the length/character rules.**

---

## 4. Setup this phase needs from you (external account actions)

GitHub OAuth Apps only support a single callback URL each, so **two separate OAuth Apps are needed** — one for local dev, one for production:

1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App, twice:
   - **Dev app**: Homepage URL `http://localhost:3000`, Authorization callback URL `http://localhost:3000/api/auth/callback/github`.
   - **Prod app**: Homepage URL your Vercel URL, Authorization callback URL `https://<your-vercel-domain>/api/auth/callback/github`.
2. Each app gives you a Client ID + Client Secret — dev app's values go in `.env.local`, prod app's values go in Vercel's env vars.
3. Generate `AUTH_SECRET` (e.g. `openssl rand -base64 32`) — a different value for local vs. production is fine and actually preferable (they're separate signing secrets, not something that needs to match).

I'll add all three (`AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`) to `env.ts`'s validation and `.env.local.example` as part of implementation.

---

## 5. Review checkpoint (restated as concrete acceptance criteria)

Phase 5 is done when:

- [ ] Signing in via GitHub works end-to-end, both locally and on the deployed Vercel app (two separate OAuth Apps, confirmed both callback URLs work).
- [ ] A link created while signed in has the correct `userId`; a link created while signed out still works and has `userId: null`.
- [ ] `/dashboard` redirects an unauthenticated visitor away (middleware) and lists only the signed-in user's own links.
- [ ] Editing a link's alias to one that's already taken returns a clear conflict error, not a silent failure or a generic 500.
- [ ] Setting/clearing a link's expiry updates `expiresAt` and is reflected in the existing redirect route's expiry check (from Phase 1).
- [ ] Deleting a link removes it from the dashboard and the short code subsequently 404s on redirect.
- [ ] **Ownership is enforced**: attempting to edit or delete another user's link (e.g. by guessing/crafting a request for a `shortCode` you don't own) returns `404`, not a successful mutation — this is the phase's single most important thing to verify, tested with two separate GitHub accounts (or one account plus a manually-crafted request using a real `shortCode` known to belong to someone else).
- [ ] `npm run lint`, `npm run typecheck`, `npm test` all pass; CI green.
- [ ] `DECISIONS.md` documents the JWT-vs-database-session choice, the owner-scoped dedupe resolution, and the indistinguishable-404 choice.

---

**Please answer the six open questions above (especially #1, the provider/session-strategy decision) before I begin implementation.**
