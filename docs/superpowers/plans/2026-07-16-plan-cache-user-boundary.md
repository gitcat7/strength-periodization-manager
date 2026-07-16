# Plan Cache User Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a plan-generation request from using a cached user ID belonging to another account.

**Architecture:** Authenticate before hydrating the plan screen. Hydrate only a cache whose `userId` equals the authenticated user, while keeping plan-generation queries bound to that authenticated ID.

**Tech Stack:** Next.js, React, TypeScript, Vitest.

## Global Constraints

- Preserve mobile-first plan-generation UX and existing cache TTL behavior.
- Do not expose or change Supabase credentials.
- Do not render cache data for a different authenticated user.

---

### Task 1: Scope plan-cache hydration by user

**Files:**
- Create: `src/lib/user-scoped-cache.ts`
- Test: `src/lib/user-scoped-cache.test.ts`

**Interfaces:**
- Produces: `getUserScopedCache<T extends { userId: string }>(cache: T | null, userId: string): T | null`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { getUserScopedCache } from "./user-scoped-cache";

describe("getUserScopedCache", () => {
  it("rejects a cache saved for another user", () => {
    expect(getUserScopedCache({ userId: "previous-user", value: "old" }, "current-user")).toBeNull();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm.cmd test src/lib/user-scoped-cache.test.ts`

Expected: FAIL because `./user-scoped-cache` does not exist.

- [x] **Step 3: Write minimal implementation**

```ts
export function getUserScopedCache<T extends { userId: string }>(cache: T | null, userId: string): T | null {
  return cache?.userId === userId ? cache : null;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm.cmd test src/lib/user-scoped-cache.test.ts`

Expected: PASS.

### Task 2: Authenticate before restoring the plan cache

**Files:**
- Modify: `src/components/plan/program-manager.tsx:158-185`
- Test: `src/lib/user-scoped-cache.test.ts`

**Interfaces:**
- Consumes: `getUserScopedCache` from Task 1.
- Produces: Plan-page hydration only after `supabase.auth.getUser()` identifies the active user.

- [x] **Step 1: Extend the failing test**

```ts
it("returns the cache when it belongs to the authenticated user", () => {
  const cache = { userId: "current-user", value: "current" };
  expect(getUserScopedCache(cache, "current-user")).toBe(cache);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm.cmd test src/lib/user-scoped-cache.test.ts`

Expected: FAIL until Task 1 implementation is present.

- [x] **Step 3: Write minimal implementation**

```ts
useEffect(() => {
  loadCurrentProgram();
}, []);

// After auth.getUser() succeeds:
const cached = getUserScopedCache(readClientCache<PlanCache>(planCacheKey), userData.user.id);
if (cached) hydratePlanCache(cached);
```

Keep `status` as `loading` until the authenticated user ID is set; retain the existing server refresh and cache rewrite.

- [x] **Step 4: Run focused tests**

Run: `pnpm.cmd test src/lib/user-scoped-cache.test.ts`

Expected: PASS.

### Task 3: Verify the full application gate

**Files:**
- Modify: none.

- [ ] **Step 1: Run the release gate**

Run: `pnpm.cmd release:check`

Expected: exit code 0, including typecheck, tests, lint, and production build.
