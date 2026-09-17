# URL Shortener with Analytics

A production-quality URL shortener built to demonstrate system design skills: durable
click tracking via an outbox pattern, decoupled reads/writes, and serverless-aware
database access — all on free-tier infrastructure.

See [DECISIONS.md](DECISIONS.md) for the full design-decisions log (the reasoning behind
every architectural choice, and the alternatives rejected).

## Status

🚧 Phase 0 (Foundations & Setup) — see [PHASE_0.md](PHASE_0.md) for this phase's plan.

## Stack

- **Framework**: Next.js (App Router), deployed on Vercel
- **Database**: MongoDB Atlas (M0 free tier) via Mongoose
- **Async processing**: an outbox pattern (a `outbox_events` collection), drained in
  bounded batches by a GitHub Actions cron job — see Phase 2/3 in `DECISIONS.md`
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
   [mongodb.com/atlas](https://www.mongodb.com/atlas) and grab its connection string.

3. **Configure environment variables**

   ```bash
   cp .env.local.example .env.local
   ```

   Fill in `MONGODB_URI` in `.env.local` with your Atlas connection string.

4. **Run the dev server**

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

Deployed on Vercel. `MONGODB_URI` must be set in the Vercel project's environment
variables (Project Settings → Environment Variables) for the deployed app to connect to
Atlas.

## Architecture

Architecture diagram and full design-decisions writeup will be completed in Phase 8. See
`DECISIONS.md` in the meantime for the reasoning behind each phase's choices as they're
made.
