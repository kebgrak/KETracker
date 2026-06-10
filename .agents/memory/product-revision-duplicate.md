---
name: Product revision field & duplicate
description: Products have a revision column; duplicate endpoint clones product+steps; codegen workflow notes.
---

# Product revision & duplicate

## Rule
- `productsTable` has a `revision` text column (nullable). Max 10 chars enforced at the form level (not DB level).
- `POST /products/:id/duplicate` copies the product row (appending " (copy)" to name) and all its steps into a new product. The step 99 is included in the copy since it's just a regular row at copy time.
- After any change to `openapi.yaml`, always run codegen (`pnpm --filter @workspace/api-spec run codegen`) and then manually fix `lib/api-zod/src/index.ts` — orval overwrites it with a stale `export * from "./generated/api.schemas"` line that doesn't exist; replace with just `export * from "./generated/api";`.

**Why:** Contract-first architecture means schema → spec → codegen → types. Skipping codegen after spec changes causes type drift between server Zod schemas and generated React Query hooks.

**How to apply:** Any time a product field is added/changed, update both `lib/db/src/schema/index.ts` AND `lib/api-spec/openapi.yaml`, then push DB and re-run codegen.
