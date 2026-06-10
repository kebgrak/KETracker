---
name: standardTimeMinutes unit
description: The DB field standardTimeMinutes stores values in SECONDS, not minutes — always divide by 60 before using alongside timeWorkedMinutes.
---

The `standardTimeMinutes` column (and the corresponding API field) stores values in **seconds** (e.g. 250 = 250 seconds). The name is misleading. The admin UI confirms this by displaying the raw value with a " sec" suffix.

**Why:** The field was named before the unit was finalised; renaming would require a migration and codegen changes.

**How to apply:** Wherever `standardTimeMinutes` must be compared to or combined with `timeWorkedMinutes` (which is in minutes), convert: `stdMin = stdSec / 60`.

Correct usages already in the codebase:
- `Dashboard.tsx` — `operatorEfficiency`: `const expected = (stdSec / 60) * qty`
- `Dashboard.tsx` — daily target: `const stdMin = stdSec / 60; return s + (ops * mins) / stdMin`
- `efficiency.ts` — `calcProductEfficiency`: `const stdMin = stdSec / 60`
- `Reports.tsx` PDF — `didParseCell` and operator summary: `(stdSec / 60) * qty`
