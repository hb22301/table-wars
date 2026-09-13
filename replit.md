# Multiplication Tables

A focused timed multiplication practice game with study tables and a shared leaderboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## Release metadata

- Current app version: `v1.2.6`
- Publish date: September 13, 2026
- Publish at: 2026-09-13T02:41:42.439Z
- Versioning rule: increment the patch for each update; after patch 9, reset patch to 0 and increment minor; after minor 9, reset minor to 0 and increment major.
- Source of truth for release version: `artifacts/multiplication-tables/package.json`
- Release command: `pnpm --filter @workspace/multiplication-tables run release:patch`
- Release check: `pnpm --filter @workspace/multiplication-tables run release:check`
- Every user-visible software update must run the release command before delivery; it synchronizes the package, visible app metadata, HTML metadata, and this file.
- Leaderboard entries older than 7 days are excluded from shared leaderboard results by the API.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
