---
name: Post-codegen index.ts fix
description: After running orval codegen, two index files get overwritten with stale exports that cause build errors. Always fix them manually.
---

## The rule

After running `pnpm --filter @workspace/api-spec run codegen`, orval overwrites both:
- `lib/api-zod/src/index.ts`
- `lib/api-client-react/src/index.ts`

with a broken line `export * from "./generated/api.schemas"` (the file doesn't exist in split mode).

**Fix `lib/api-zod/src/index.ts`** — must only contain:
```ts
export * from "./generated/api";
```

**Fix `lib/api-client-react/src/index.ts`** — must only contain:
```ts
export * from "./generated/api";
export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
```

**Why:** Orval `mode: "split"` without `schemas` option generates only `api.ts`, not `api.schemas.ts`, but still writes stale exports pointing to the missing file.

**How to apply:** Any time codegen is run, immediately fix both files before doing anything else.
