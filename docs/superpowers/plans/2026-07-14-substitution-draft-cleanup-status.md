# Substitution Draft Cleanup Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface incomplete local draft cleanup after a committed exercise substitution without blocking the completed substitution.

**Architecture:** The two targeted cleanup helpers in `client-cache.ts` return a backward-compatible boolean completion signal while continuing to swallow browser-storage errors. `TodayWorkout` consumes both signals only in its validated, committed-success path and retains the existing warning copy whenever cleanup cannot be confirmed.

**Tech Stack:** Next.js 14, React, TypeScript, Vitest, browser `Storage`.

## Global Constraints

- Keep cache cleanup non-throwing so a local-storage failure never blocks training flow.
- `clearWorkoutDrafts` and `clearWorkoutDraftsByExerciseIds` return `true` for empty input and fully confirmed cleanup.
- Both helpers return `false` for unavailable browser storage or any unconfirmed cleanup.
- An unparseable scanned draft remains untouched and makes `clearWorkoutDraftsByExerciseIds` return `false`.
- Do not change other cache invalidation call sites or the separate malformed-RPC `committed_unverified` path.
- Use the existing Chinese warning: `替换已成功，但本地草稿清理未完全确认。`.

---

### Task 1: Make cleanup confirmation observable

**Files:**
- Modify: `src/lib/client-cache.ts:75-131`
- Modify: `src/lib/client-cache.test.ts:1-190`

**Interfaces:**
- Produces: `clearWorkoutDrafts(workoutIds: string[]): boolean`.
- Produces: `clearWorkoutDraftsByExerciseIds(workoutExerciseIds: string[]): boolean`.
- Consumes: browser `window.localStorage`; no new dependencies.

- [ ] **Step 1: Write failing tests for the boolean contract**

Add assertions to successful and empty-input tests, and add these tests to `src/lib/client-cache.test.ts`:

```ts
it("reports false without throwing when localStorage is unavailable", () => {
  setMockLocalStorage(undefined);

  expect(clearWorkoutDrafts(["workout-a"])).toBe(false);
  expect(clearWorkoutDraftsByExerciseIds(["we-1"])).toBe(false);
});

it("reports false when a targeted draft cannot be removed", () => {
  const localStorage = createMockStorage();
  const removeItem = localStorage.removeItem.bind(localStorage);
  localStorage.removeItem = (key) => {
    if (key === "strength-training-draft:workout-a") throw new Error("storage denied");
    removeItem(key);
  };
  setMockLocalStorage(localStorage);
  localStorage.setItem("strength-training-draft:workout-a", "{}");

  expect(clearWorkoutDrafts(["workout-a"])).toBe(false);
});

it("reports false when a scanned draft cannot be parsed", () => {
  const localStorage = createMockStorage();
  setMockLocalStorage(localStorage);
  localStorage.setItem("strength-training-draft:workout-a", "not-valid-json");

  expect(clearWorkoutDraftsByExerciseIds(["we-1"])).toBe(false);
  expect(localStorage.getItem("strength-training-draft:workout-a")).toBe("not-valid-json");
});
```

Change successful cleanup expectations to `toBe(true)` and empty-input expectations to `toBe(true)`.

- [ ] **Step 2: Run the cache test to verify RED**

Run:

```powershell
$env:PATH = 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\override;C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback;' + $env:PATH
& 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd' vitest run src/lib/client-cache.test.ts
```

Expected: the new tests fail because the helpers return `undefined`.

- [ ] **Step 3: Implement the minimal boolean result**

Replace `clearWorkoutDrafts` with:

```ts
export function clearWorkoutDrafts(workoutIds: string[]): boolean {
  if (workoutIds.length === 0) return true;
  if (typeof window === "undefined") return false;

  try {
    const allKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key) allKeys.push(key);
    }

    const keysToRemove = allKeys.filter((key) => {
      if (!key.startsWith(draftPrefix)) return false;
      return workoutIds.includes(key.slice(draftPrefix.length));
    });
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    return true;
  } catch {
    return false;
  }
}
```

Replace `clearWorkoutDraftsByExerciseIds` with:

```ts
export function clearWorkoutDraftsByExerciseIds(workoutExerciseIds: string[]): boolean {
  if (workoutExerciseIds.length === 0) return true;
  if (typeof window === "undefined") return false;

  try {
    const allKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key) allKeys.push(key);
    }

    const draftKeys = allKeys.filter((key) => key.startsWith(draftPrefix));
    const keysToRemove: string[] = [];
    let cleanupConfirmed = true;

    for (const key of draftKeys) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const draft = JSON.parse(raw) as Record<string, unknown>;
        const hasMatch = Object.keys(draft).some((draftKey) => {
          const exerciseLogs = draft[draftKey];
          return (
            Array.isArray(exerciseLogs) &&
            exerciseLogs.some(
              (log: unknown) =>
                log &&
                typeof log === "object" &&
                workoutExerciseIds.includes((log as { workout_exercise_id?: string }).workout_exercise_id ?? "")
            )
          );
        });
        if (hasMatch) keysToRemove.push(key);
      } catch {
        cleanupConfirmed = false;
      }
    }

    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    return cleanupConfirmed;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the cache test to verify GREEN**

Run the Step 2 command.

Expected: all `client-cache.test.ts` tests pass.

- [ ] **Step 5: Commit the helper contract**

```powershell
git add -- src/lib/client-cache.ts src/lib/client-cache.test.ts
git commit -m "fix: report incomplete workout draft cleanup"
```

### Task 2: Surface unconfirmed cleanup after a valid substitution

**Files:**
- Modify: `src/components/today/today-workout.tsx:860-884`
- Modify: `src/components/today/exercise-substitution-dialog-state.ts`
- Test: `src/components/today/exercise-substitution-dialog-state.test.ts`

**Interfaces:**
- Consumes: `clearWorkoutDrafts(workoutIds): boolean` from Task 1.
- Consumes: `clearWorkoutDraftsByExerciseIds(workoutExerciseIds): boolean` from Task 1.
- Produces: `getSubstitutionDraftCleanupWarning(lookupFailed, currentDraftsCleared, affectedDraftsCleared): string | null`.
- Produces: existing `draftCleanupWarning` when the database lookup or either local cleanup is unconfirmed.

- [ ] **Step 1: Write a failing warning-aggregation test**

Import `getSubstitutionDraftCleanupWarning` into `src/components/today/exercise-substitution-dialog-state.test.ts` and add:

```ts
describe("getSubstitutionDraftCleanupWarning", () => {
  it("warns when either draft cleanup is unconfirmed", () => {
    expect(getSubstitutionDraftCleanupWarning(false, false, true)).toBe(
      "替换已成功，但本地草稿清理未完全确认。"
    );
    expect(getSubstitutionDraftCleanupWarning(false, true, false)).toBe(
      "替换已成功，但本地草稿清理未完全确认。"
    );
  });

  it("warns when the affected-workout lookup fails", () => {
    expect(getSubstitutionDraftCleanupWarning(true, true, true)).toBe(
      "替换已成功，但本地草稿清理未完全确认。"
    );
  });

  it("does not warn after fully confirmed cleanup", () => {
    expect(getSubstitutionDraftCleanupWarning(false, true, true)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the warning test to verify RED**

Run:

```powershell
& 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd' vitest run src/components/today/exercise-substitution-dialog-state.test.ts
```

Expected: the new tests fail because `getSubstitutionDraftCleanupWarning` does not exist.

- [ ] **Step 3: Implement warning aggregation and integrate it**

Add this exported function to `src/components/today/exercise-substitution-dialog-state.ts`:

```ts
export function getSubstitutionDraftCleanupWarning(
  lookupFailed: boolean,
  currentDraftsCleared: boolean,
  affectedDraftsCleared: boolean
): string | null {
  if (lookupFailed || !currentDraftsCleared || !affectedDraftsCleared) {
    return "替换已成功，但本地草稿清理未完全确认。";
  }

  return null;
}
```

Import it in `today-workout.tsx`. After `allWorkoutIds` is calculated, replace the cleanup calls and warning condition with:

```ts
const currentDraftsCleared = clearWorkoutDrafts(allWorkoutIds);
const affectedDraftsCleared = clearWorkoutDraftsByExerciseIds(result.affectedIds);
draftCleanupWarning = getSubstitutionDraftCleanupWarning(
  Boolean(lookupError),
  currentDraftsCleared,
  affectedDraftsCleared
);
```

Do not change analytics, dialog closing, reload behavior, or the `committed_unverified` branch.

- [ ] **Step 4: Run focused checks**

Run:

```powershell
& 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd' vitest run src/lib/client-cache.test.ts src/components/today/exercise-substitution-dialog-state.test.ts
& 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd' typecheck
git diff --check
```

Expected: both test files pass, TypeScript has no errors, and `git diff --check` produces no output.

- [ ] **Step 5: Run the project release gate**

Load only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `C:\Users\yaokui\Documents\strength-periodization-manager\.env.local` into the process without printing them, then run:

```powershell
& 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd' release:check
```

Expected: typecheck, optimized build, and local smoke checks pass.

- [ ] **Step 6: Commit the Today integration**

```powershell
git add -- src/components/today/exercise-substitution-dialog-state.ts src/components/today/exercise-substitution-dialog-state.test.ts src/components/today/today-workout.tsx
git commit -m "fix: warn when substitution draft cleanup is unconfirmed"
```
