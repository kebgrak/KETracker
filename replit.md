# Production Tracker

A production work reporting system where operators log their work against product flowcharts and administrators manage the full setup.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec (run `node build.mjs` in api-zod after to fix index.ts)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

Required env vars: `DATABASE_URL` (auto-set by Replit DB)

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Routing**: wouter
- **Forms**: react-hook-form + zodResolver

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/db/src/schema/index.ts` — Drizzle schema (operators, products, steps, work_reports)
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — generated Zod schemas for server validation (do not edit)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/production-tracker/src/pages/` — React page components

## Architecture decisions

- Contract-first: OpenAPI spec drives all codegen; never write API types by hand
- `lib/api-zod/src/index.ts` only exports from `./generated/api` (not `./generated/types`) to avoid duplicate export conflicts
- Orval `mode: "split"` without `schemas` option to prevent duplicate TypeScript interface + Zod schema conflicts
- Steps are ordered by `step_number` and cascade-delete when a product is deleted

## Product

- **Operator panel** (`/`, `/reports`): Select operator + product + step, enter time and quantity, submit daily work reports. View/filter all submitted reports.
- **Admin panel** (`/admin*`): Dashboard with totals and productivity stats. Manage operators (name, employee ID, admin flag). Manage products and their flowchart steps (step number, name, standard time).

## Gotchas

- After changing `openapi.yaml`, always re-run codegen AND manually fix `lib/api-zod/src/index.ts` (orval overwrites it with stale exports)
- `standardTimeMinutes` is stored as `numeric` in Postgres — comes back as a string from Drizzle; coerce with `Number()` where needed
