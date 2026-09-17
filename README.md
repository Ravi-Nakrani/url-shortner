# URL Shortener with Analytics

A production-quality URL shortener built to demonstrate system design skills: durable
click tracking via an outbox pattern, decoupled reads/writes, and serverless-aware
database access — all on free-tier infrastructure.

See [DECISIONS.md](DECISIONS.md) for the full design-decisions log (the reasoning behind
every architectural choice, and the alternatives rejected).

## Status

🚧 Phase 5 (Auth & Per-User Link Management) complete — see `PHASE_0.md` through
`PHASE_5.md` for each phase's plan.

## Stack

- **Framework**: Next.js (App Router), deployed on Vercel
- **Database**: MongoDB Atlas (M0 free tier) via Mongoose — the only backing store,
  used for application data, the outbox, rate limiting, and (via signed JWT sessions,
  no adapter) auth
- **Async processing**: an outbox pattern (an `outbox_events` collection), drained in
  bounded batches by a GitHub Actions cron job — see Phase 2/3 in `DECISIONS.md`
- **Auth**: NextAuth v5 (Auth.js), GitHub OAuth, JWT sessions
- **Rate limiting**: a MongoDB-backed fixed-window counter with a TTL index — see
  Phase 4 in `DECISIONS.md`
- **Validation**: zod, for both environment variables and API request bodies
- **Testing**: Vitest
- **Linting/formatting**: ESLint (Next.js config) + Prettier, enforced on commit via
  Husky + lint-staged

## Local setup

1. **Clone and install dependencies**

   ```bash
   npm install
   ```

2. **Create a MongoDB Atlas cluster** (free M0 tier) at
   [mongodb.com/atlas](https://www.mongodb.com/atlas), grab its connection string, and
   allow access from anywhere (`0.0.0.0/0`) under Network Access — Vercel's serverless
   functions don't have a fixed IP.

3. **Create two GitHub OAuth Apps** (GitHub → Settings → Developer settings → OAuth
   Apps → New OAuth App) — one per environment, since each OAuth App only supports a
   single callback URL:
   - **Dev app**: Homepage URL `http://localhost:3000`, Authorization callback URL
     `http://localhost:3000/api/auth/callback/github`.
   - **Prod app**: Homepage URL your Vercel deployment URL, Authorization callback URL
     `https://<your-vercel-domain>/api/auth/callback/github`.

   Each gives you a Client ID + Client Secret — the dev app's values go in
   `.env.local`, the prod app's go in Vercel's env vars.

4. **Configure environment variables**

   ```bash
   cp .env.local.example .env.local
   ```

   Fill in `.env.local`:
   - `MONGODB_URI` — your Atlas connection string.
   - `OUTBOX_SECRET` — any random string (e.g. `openssl rand -hex 32`); also needed as
     a GitHub Actions secret to authorize the outbox-drain workflow.
   - `AUTH_SECRET` — `openssl rand -base64 32`.
   - `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` — from the **dev** GitHub OAuth App above.

5. **Run the dev server**

   ```bash
   npm run dev
   ```

   Visit [http://localhost:3000](http://localhost:3000). Check
   [http://localhost:3000/api/health](http://localhost:3000/api/health) to confirm the
   database connection is working.

## Scripts

| Command                | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Start the Next.js dev server             |
| `npm run build`        | Production build                         |
| `npm run lint`         | ESLint                                   |
| `npm run typecheck`    | `tsc --noEmit`                           |
| `npm test`             | Run the Vitest test suite                |
| `npm run format`       | Format the codebase with Prettier        |
| `npm run format:check` | Check formatting without writing changes |

A pre-commit hook (Husky + lint-staged) runs lint and format checks automatically on
staged files.

## Deployment

Deployed on Vercel. Set these in the Vercel project's environment variables (Project
Settings → Environment Variables): `MONGODB_URI`, `OUTBOX_SECRET`, `AUTH_SECRET`,
`AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` (using the **prod** GitHub OAuth App's
credentials, not the dev app's).

The outbox-drain scheduler (`.github/workflows/drain-outbox.yml`) needs two GitHub
Actions repository secrets (Settings → Secrets and variables → Actions): `APP_URL`
(your Vercel production URL) and `OUTBOX_SECRET` (matching Vercel's value).

## Architecture

Architecture diagram and full design-decisions writeup will be completed in Phase 8. See
`DECISIONS.md` in the meantime for the reasoning behind each phase's choices as they're
made.
