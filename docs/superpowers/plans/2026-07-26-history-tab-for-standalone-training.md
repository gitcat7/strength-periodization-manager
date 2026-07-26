# History Tab for Standalone Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put training history in the mobile bottom navigation so users without a program can directly review standalone workout records.

**Architecture:** Keep the five-item mobile navigation layout. Replace the bottom-nav PR item with a History item targeting the existing `/history` page; leave the PR route and its existing non-navigation entry points unchanged. Protect the navigation contract with a focused static component test.

**Tech Stack:** Next.js App Router, React, TypeScript, Lucide icons, Vitest.

## Global Constraints

- Keep five bottom-navigation items: 今日、计划、进展、历史、设置.
- Do not change standalone-workout persistence, history queries, database schema, or the `/pr` route.
- Preserve mobile-first navigation sizing and existing active-state behavior.

---

### Task 1: Expose history in the bottom navigation

**Files:**
- Modify: `src/components/navigation/bottom-nav.tsx:5-15`
- Modify: `src/components/navigation/bottom-nav.test.ts:8-23`

**Interfaces:**
- Consumes: the existing `isNavigationItemActive(pathname, href)` navigation-state helper.
- Produces: a `navItems` collection that includes `{ href: "/history", label: "历史", icon: History }` and no bottom-nav `/pr` item.

- [ ] **Step 1: Write the failing test**

Add this test to `src/components/navigation/bottom-nav.test.ts`:

```ts
it("makes history a primary tab without removing the PR route", async () => {
  const component = await readFile(componentPath, "utf8");

  expect(component).toContain('href: "/history", label: "历史", icon: History');
  expect(component).not.toContain('href: "/pr", label: "PR", icon: Trophy');
  expect(component).toContain('grid-cols-5');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
& '.\\node_modules\\.bin\\vitest.cmd' run src/components/navigation/bottom-nav.test.ts --pool=threads --poolOptions.threads.singleThread
```

Expected: the new assertion fails because `bottom-nav.tsx` still defines the `/pr` navigation item and does not import `History`.

- [ ] **Step 3: Make the minimal navigation change**

In `src/components/navigation/bottom-nav.tsx`, replace the Lucide `Trophy` import with `History`, then replace:

```ts
{ href: "/pr", label: "PR", icon: Trophy },
```

with:

```ts
{ href: "/history", label: "历史", icon: History },
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run the Step 2 command again. Expected: `bottom-nav.test.ts` passes.

- [ ] **Step 5: Run all unit tests**

Run:

```powershell
& '.\\node_modules\\.bin\\vitest.cmd' run --pool=threads --poolOptions.threads.singleThread
```

Expected: all tests pass, with any pre-existing skipped test reported separately.

- [ ] **Step 6: Commit the scoped change**

```powershell
git add src/components/navigation/bottom-nav.tsx src/components/navigation/bottom-nav.test.ts
git commit -m "feat: add history to bottom navigation"
```

### Task 2: Release verification

**Files:**
- Verify only: `src/components/navigation/bottom-nav.tsx`, `src/components/navigation/bottom-nav.test.ts`

**Interfaces:**
- Consumes: the existing `/history` page and standalone-workout completion links.
- Produces: no new runtime interface.

- [ ] **Step 1: Run the local release check**

Load local environment variables without printing them, set `npm_execpath` to the bundled pnpm entry point, then run:

```powershell
node scripts/release-check.mjs
```

Expected: typecheck, production build, and all local smoke routes pass.

- [ ] **Step 2: Verify the navigation source contract**

Run:

```powershell
rg -n 'href: "/history"|label: "历史"|href: "/pr"' src/components/navigation/bottom-nav.tsx
```

Expected: `/history` and `历史` are present; `/pr` is absent from this file.
