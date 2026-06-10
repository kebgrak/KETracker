---
name: Lineleader role and step 99 auto-generation
description: Architecture for the Lineleader operator role and Step 99 auto-managed step per product.
---

## Rules
- `isLineleader` boolean on `operatorsTable` — mutually exclusive with `isAdmin`.
- Step 99 ("Ready parts for the day") is auto-managed per product: `standardTimeMinutes` = sum of all root steps (`subStepLabel IS NULL`, `stepNumber != 99`).
- `upsertStep99(productId)` in `artifacts/api-server/src/lib/step99.ts` is called after every step create/update/delete and on product create.
- `initAllStep99()` is called on server startup to backfill existing products.
- Step 99 is blocked from manual create/edit/delete in the admin steps route (returns 400).

## Work Entry role filtering
- Lineleaders (`isLineleader=true`): see ONLY step 99 in Work Entry.
- Regular operators: see all steps EXCEPT step 99.
- Filtering applied in `OperatorEntry.tsx` via `allStepGroups` → filtered `stepGroups`.

## Dashboard / ProductDetail
- All summary stats (`/api/summary/*`) are filtered to step 99 reports (join stepsTable, WHERE stepNumber=99).
- `allReports.data` in Dashboard is filtered client-side to `step99Reports` for efficiency calculations.
- Product cycle time shown in ProductDetail = step 99's `standardTimeMinutes`.
- Efficiency in ProductDetail uses step 99 reports only (no lastStep exclusion).

**Why:** Step 99 represents the full cycle time for a product (sum of all operations). Lineleaders are responsible for "readying parts" — their work is measured by step 99 throughput only.
