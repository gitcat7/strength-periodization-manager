# wger External Exercise Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bundled third-party exercise directory with a server-side wger reference integration while preserving local core actions for periodization.

**Architecture:** The browser calls only internal Next.js routes. A typed server adapter queries wger's public API, validates and normalizes bounded results, and serves short-lived cached references. Standalone workout rows may reference either a local core exercise or a wger snapshot; plans, PRs, and recommendations stay on the local core-action path.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Supabase/Postgres/RLS, Vercel, wger public REST API.

## Global Constraints

- Do not copy, sync, bundle, or persist the complete wger/third-party action directory in Supabase, repository files, or durable browser storage.
- The browser must never call wger directly; only `src/app/api/exercise-catalog/*` may reach the allowlisted upstream base URL.
- Keep `kg` as the only weight unit and preserve authenticated per-user RLS ownership.
- Preserve existing local core actions for push/pull/squat programming, substitutions, PRs, and recommendations; their behavior must not require wger availability.
- Store only completed/draft external-action snapshots required to reproduce a user record: provider, ID, name, muscles/equipment/category and source URL. Do not store descriptions, images, video, or a mirrored catalog.
- Use `wger` exactly as the provider value. Validate all provider/ID/name/snapshot fields at the database RPC boundary.
- Do not alter or delete already-applied historical migration files. Add forward-only migrations and update `supabase/schema.sql` to describe the resulting schema.
- Give clear retry copy for upstream failure and preserve the in-progress single-workout form state.

---

## File Structure

- Create `src/domain/external-exercise.ts`: provider-independent normalized reference and snapshot types plus runtime guards.
- Create `src/lib/wger-client.ts`: allowlisted, timed, paginated wger fetcher and response mapper.
- Create `src/lib/wger-client.test.ts`: mocked upstream behavior and mapping boundary tests.
- Create `src/app/api/exercise-catalog/search/route.ts`: authenticated internal search/filter API.
- Create `src/app/api/exercise-catalog/[externalId]/route.ts`: authenticated detail API.
- Create `supabase/migrations/20260716130000_wger_external_exercise_references.sql`: forward-only reference fields, constraints and hardened standalone workout RPC.
- Modify `supabase/schema.sql`: represent the new fields, constraint and final RPC contract for fresh environments.
- Modify `src/domain/single-workout.ts` and its tests: accept either core or wger references, serialize snapshots, and safely restore drafts.
- Modify `src/components/single-workout/single-workout-recorder.tsx`: search wger through the internal route, select textual results, retain form state on failure.
- Modify `src/app/single-workout/page.tsx`: stop loading the full `exercises` table for discovery; load only the user's own workout/draft data.
- Modify history/progress/export/agent read paths that join `workout_exercises.exercises`: display snapshot names when `exercise_id` is null.
- Modify `src/components/exercises/*`, catalog helpers, scripts, service-worker/cache configuration and `THIRD_PARTY_NOTICES.md`: remove the old static `hasaneyldrm` directory and expose wger source attribution without breaking local core-action detail/substitution UI.

### Task 1: Define and test the external-reference contract

**Files:**
- Create: `src/domain/external-exercise.ts`
- Create: `src/domain/external-exercise.test.ts`

**Interfaces:**
- Produces `ExternalExerciseReference`, `ExternalExerciseSnapshot`, `isWgerExternalId(value)` and `toExternalExerciseSnapshot(reference)`.
- `ExternalExerciseReference` is `{ provider: "wger"; externalId: string; name: string; muscles: string[]; equipment: string[]; category: string | null; sourceUrl: string }`.

- [ ] **Step 1: Write failing domain tests**

```ts
import { describe, expect, it } from "vitest";
import { isWgerExternalId, toExternalExerciseSnapshot } from "./external-exercise";

describe("wger external reference", () => {
  it("accepts a positive decimal wger id and snapshots only record-safe fields", () => {
    expect(isWgerExternalId("123")).toBe(true);
    expect(isWgerExternalId("0")).toBe(false);
    expect(toExternalExerciseSnapshot({ provider: "wger", externalId: "123", name: "Bench press", muscles: ["Pectoralis major"], equipment: ["Barbell"], category: "Chest", sourceUrl: "https://wger.de/en/exercise/123" })).toEqual({ muscles: ["Pectoralis major"], equipment: ["Barbell"], category: "Chest", sourceUrl: "https://wger.de/en/exercise/123" });
  });
});
```

- [ ] **Step 2: Run the targeted test and confirm it fails**

Run: `npm test -- src/domain/external-exercise.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the exact contract**

```ts
export type ExternalExerciseReference = {
  provider: "wger";
  externalId: string;
  name: string;
  muscles: string[];
  equipment: string[];
  category: string | null;
  sourceUrl: string;
};

export type ExternalExerciseSnapshot = Pick<ExternalExerciseReference, "muscles" | "equipment" | "category" | "sourceUrl">;
export const isWgerExternalId = (value: string) => /^[1-9]\d{0,8}$/.test(value);
export const toExternalExerciseSnapshot = ({ muscles, equipment, category, sourceUrl }: ExternalExerciseReference): ExternalExerciseSnapshot => ({ muscles, equipment, category, sourceUrl });
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/domain/external-exercise.test.ts`

Expected: PASS.

```bash
git add src/domain/external-exercise.ts src/domain/external-exercise.test.ts
git commit -m "feat: define external exercise references"
```

### Task 2: Add the server-only wger adapter and internal API

**Files:**
- Create: `src/lib/wger-client.ts`
- Create: `src/lib/wger-client.test.ts`
- Create: `src/app/api/exercise-catalog/search/route.ts`
- Create: `src/app/api/exercise-catalog/[externalId]/route.ts`

**Interfaces:**
- Consumes `ExternalExerciseReference` from Task 1.
- Produces `searchWgerExercises(input: { query: string; category?: string; page: number }): Promise<{ items: ExternalExerciseReference[]; hasMore: boolean }>` and `getWgerExercise(externalId: string): Promise<ExternalExerciseReference | null>`.
- Internal HTTP routes accept only `q`, `category`, and `page`; no request field can supply a URL or provider.

- [ ] **Step 1: Write failing adapter tests with a mocked fetch**

```ts
it("maps a bounded wger response to references without returning upstream descriptions", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ id: 42, name: "Bench press", muscles: [{ name: "Pectoralis major" }], equipment: [{ name: "Barbell" }], category: { name: "Chest" } }], next: null }), { status: 200 })));
  await expect(searchWgerExercises({ query: "bench", page: 1 })).resolves.toEqual({ items: [{ provider: "wger", externalId: "42", name: "Bench press", muscles: ["Pectoralis major"], equipment: ["Barbell"], category: "Chest", sourceUrl: "https://wger.de/en/exercise/42" }], hasMore: false });
});

it("returns a typed unavailable error when wger times out", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));
  await expect(searchWgerExercises({ query: "bench", page: 1 })).rejects.toMatchObject({ code: "WGER_UNAVAILABLE" });
});
```

- [ ] **Step 2: Run the adapter test and confirm it fails**

Run: `npm test -- src/lib/wger-client.test.ts`

Expected: FAIL because `wger-client` does not exist.

- [ ] **Step 3: Implement a bounded adapter**

```ts
const WGER_BASE_URL = new URL(process.env.WGER_API_BASE_URL ?? "https://wger.de/api/v2/");
const REQUEST_TIMEOUT_MS = 4_000;
const PAGE_SIZE = 20;

function upstreamUrl(path: string, query: Record<string, string>) {
  const url = new URL(path, WGER_BASE_URL);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}
```

Use `AbortSignal.timeout(REQUEST_TIMEOUT_MS)` or an equivalent controller, clamp pages to `1..50`, trim query to 80 characters, cap upstream results to `PAGE_SIZE`, cache successful normalized requests in memory for 5 minutes, and throw `new WgerUnavailableError()` for timeouts/non-2xx/unparseable payloads. Inspect the current wger OpenAPI document before choosing endpoint names and update only the mapper, never the client-facing interface. Do not include description/media properties in normalized return data.

- [ ] **Step 4: Implement route validation and errors**

```ts
// Successful response: { items, hasMore }
// Bad query/id: 400 { error: "INVALID_EXERCISE_QUERY" }
// Upstream failure: 503 { error: "WGER_UNAVAILABLE" }
```

Require the existing Supabase session in both routes, return 401 for missing session, set `Cache-Control: private, max-age=60`, and never expose raw upstream error bodies.

- [ ] **Step 5: Run targeted tests, lint, and commit**

Run: `npm test -- src/lib/wger-client.test.ts src/domain/external-exercise.test.ts && npm run lint`

Expected: PASS.

```bash
git add src/lib/wger-client.ts src/lib/wger-client.test.ts src/app/api/exercise-catalog src/domain
git commit -m "feat: proxy wger exercise references"
```

### Task 3: Migrate workout records and harden the database write boundary

**Files:**
- Create: `supabase/migrations/20260716130000_wger_external_exercise_references.sql`
- Modify: `supabase/schema.sql`
- Modify: `src/domain/single-workout.ts`
- Modify: `src/domain/single-workout.test.ts`

**Interfaces:**
- `workout_exercises` supports either a local `exercise_id` or a `wger` external reference.
- The standalone workout RPC receives `external_exercise_id`, `exercise_name_snapshot`, and `exercise_metadata_snapshot` only for external rows.

- [ ] **Step 1: Write failing payload tests**

```ts
it("serializes an external standalone exercise without a local exercise id", () => {
  expect(buildStandaloneWorkoutPayload(/* external draft */).exercises[0]).toMatchObject({
    exercise_id: null,
    exercise_provider: "wger",
    external_exercise_id: "42",
    exercise_name_snapshot: "Bench press",
  });
});

it("rejects a row that mixes a local id and an external reference", () => {
  expect(() => parseStandaloneWorkoutDraft(/* mixed values */)).toThrow("INVALID_EXERCISE_REFERENCE");
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- src/domain/single-workout.test.ts`

Expected: FAIL because external reference handling is absent.

- [ ] **Step 3: Write the forward migration**

```sql
alter table public.workout_exercises alter column exercise_id drop not null;
alter table public.workout_exercises add column exercise_provider text;
alter table public.workout_exercises add column external_exercise_id text;
alter table public.workout_exercises add column exercise_name_snapshot text;
alter table public.workout_exercises add column exercise_metadata_snapshot jsonb;

alter table public.workout_exercises add constraint workout_exercises_reference_shape_check check (
  (exercise_id is not null and exercise_provider is null and external_exercise_id is null and exercise_name_snapshot is null and exercise_metadata_snapshot is null)
  or
  (exercise_id is null and exercise_provider = 'wger' and external_exercise_id ~ '^[1-9][0-9]{0,8}$' and char_length(exercise_name_snapshot) between 1 and 160 and jsonb_typeof(exercise_metadata_snapshot) = 'object')
);
```

Update the existing standalone draft/create RPC definitions in the same migration: validate the external snapshot has only `muscles`, `equipment`, `category`, and `sourceUrl`; validate arrays have at most 12 strings of 100 characters; validate `sourceUrl` begins with `https://wger.de/`; and keep `auth.uid()` as the sole user identity. Existing local plan rows must satisfy the first branch unchanged.

- [ ] **Step 4: Update TypeScript validation and schema mirror**

Add a discriminated `WorkoutExerciseReference` union to `single-workout.ts`. The local branch retains `exerciseId`; the external branch requires the Task 1 reference and serializes its snapshot. Update `supabase/schema.sql` with identical columns, constraints, and RPC parameter rules.

- [ ] **Step 5: Verify migration and commit**

Run: `npm test -- src/domain/single-workout.test.ts && npm run lint`

Expected: PASS. Apply the migration to a disposable/local Supabase environment if configured and run a SQL insert for one valid local row, one valid wger row, and one rejected mixed row.

```bash
git add supabase/migrations/20260716130000_wger_external_exercise_references.sql supabase/schema.sql src/domain/single-workout.ts src/domain/single-workout.test.ts
git commit -m "feat: store external exercise record snapshots"
```

### Task 4: Use external references in standalone recording

**Files:**
- Modify: `src/app/single-workout/page.tsx`
- Modify: `src/components/single-workout/single-workout-recorder.tsx`
- Modify: `src/components/single-workout/single-workout-recorder.test.tsx`

**Interfaces:**
- Consumes `/api/exercise-catalog/search` and `ExternalExerciseReference`.
- Sends Task 3's `buildStandaloneWorkoutPayload` output; never inserts into `exercises` to represent an external action.

- [ ] **Step 1: Write failing UI tests**

```tsx
it("adds a selected wger result to the draft and renders only text metadata", async () => {
  server.use(http.get("/api/exercise-catalog/search", () => HttpResponse.json({ items: [{ provider: "wger", externalId: "42", name: "Bench press", muscles: ["Chest"], equipment: ["Barbell"], category: "Chest", sourceUrl: "https://wger.de/en/exercise/42" }], hasMore: false })));
  render(<SingleWorkoutRecorder initialDraft={null} />);
  await userEvent.type(screen.getByRole("searchbox"), "bench");
  await userEvent.click(await screen.findByRole("button", { name: /bench press/i }));
  expect(screen.getByText("Chest · Barbell")).toBeVisible();
});

it("keeps selected actions and shows retry copy when search returns 503", async () => {
  server.use(http.get("/api/exercise-catalog/search", () => HttpResponse.json({ items: [{ provider: "wger", externalId: "42", name: "Bench press", muscles: ["Chest"], equipment: ["Barbell"], category: "Chest", sourceUrl: "https://wger.de/en/exercise/42" }], hasMore: false })));
  render(<SingleWorkoutRecorder initialDraft={null} />);
  await userEvent.type(screen.getByRole("searchbox"), "bench");
  await userEvent.click(await screen.findByRole("button", { name: /bench press/i }));
  server.use(http.get("/api/exercise-catalog/search", () => HttpResponse.json({ error: "WGER_UNAVAILABLE" }, { status: 503 })));
  await userEvent.type(screen.getByRole("searchbox"), "row");
  expect(await screen.findByRole("button", { name: "重试动作搜索" })).toBeVisible();
  expect(screen.getByText("Bench press")).toBeVisible();
});
```

- [ ] **Step 2: Run the component test and confirm it fails**

Run: `npm test -- src/components/single-workout/single-workout-recorder.test.tsx`

Expected: FAIL because the component reads the local action catalog.

- [ ] **Step 3: Replace discovery with the internal text search**

Remove the full `exercises` table query from `single-workout/page.tsx`. In the recorder, debounce textual query input by 250ms, cancel obsolete requests, call only `/api/exercise-catalog/search?q=...&page=1`, show name plus `muscles/equipment` text, and add the returned object directly as an external draft action. Retain the selected action object and all entered sets in component/draft state when fetching fails. Display a retry icon button with accessible label `重试动作搜索` for `WGER_UNAVAILABLE`.

- [ ] **Step 4: Preserve draft and completion behavior**

When restoring an existing external draft, use its name/snapshot immediately without a wger fetch. On completion, invoke the existing RPC using the Task 3 union payload. Do not advance, regenerate, or complete a periodized plan from this screen.

- [ ] **Step 5: Run focused verification and commit**

Run: `npm test -- src/components/single-workout/single-workout-recorder.test.tsx src/domain/single-workout.test.ts && npm run lint`

Expected: PASS.

```bash
git add src/app/single-workout/page.tsx src/components/single-workout src/domain/single-workout.ts
git commit -m "feat: select wger actions for standalone workouts"
```

### Task 5: Make readers, exports and agent output snapshot-aware

**Files:**
- Modify: `src/app/history/page.tsx` and its tests
- Modify: `src/app/progress/page.tsx` and its tests
- Modify: CSV export route/component used by the progress page and its tests
- Modify: `src/app/api/agent/v1/route.ts` and its tests

**Interfaces:**
- Resolve display name with `exercise?.name ?? exercise_name_snapshot`.
- The external CSV representation uses provider/id/name snapshot; it does not join or fetch wger.

- [ ] **Step 1: Write failing reader tests**

```ts
it("renders an external workout row from its immutable snapshot when exercises join is null", () => {
  expect(resolveWorkoutExerciseName({ exercises: null, exercise_name_snapshot: "Bench press" })).toBe("Bench press");
});

it("exports provider and external id for a standalone wger row", () => {
  expect(toCsvRecord(externalRow)).toMatchObject({ exercise_name: "Bench press", exercise_provider: "wger", external_exercise_id: "42" });
});
```

- [ ] **Step 2: Run these tests and confirm they fail**

Run: `npm test -- src/app/history src/app/progress src/app/api/agent`

Expected: FAIL because the read model assumes a non-null local exercise.

- [ ] **Step 3: Implement a shared read-model helper and use it everywhere**

```ts
export function resolveWorkoutExerciseName(row: { exercises: { name: string } | null; exercise_name_snapshot: string | null }) {
  return row.exercises?.name ?? row.exercise_name_snapshot ?? "未命名动作";
}
```

Add `exercise_provider` and `external_exercise_id` columns to CSV after `exercise_slug`; leave them empty for local core rows. Include source attribution URL only when it is already in the stored snapshot. Agent API outputs the same resolved name and never asks wger during history reads.

- [ ] **Step 4: Verify readers and commit**

Run: `npm test -- src/app/history src/app/progress src/app/api/agent && npm run lint`

Expected: PASS. Manually verify a local planned workout still uses its local exercise name and an external standalone row survives with a null joined `exercises` object.

```bash
git add src/app/history src/app/progress src/app/api/agent src/lib
git commit -m "feat: render external exercise snapshots in records"
```

### Task 6: Retire the static catalog without weakening core programming

**Files:**
- Modify: `src/components/exercises/exercise-library.tsx`, `exercise-detail-launcher.tsx`, `exercise-detail-panel.tsx`, `exercise-substitution-resolver.tsx` (use exact current filenames discovered before edits)
- Delete: old static catalog loaders, catalog JSON artifacts, sync/verify scripts and their dedicated tests only after no imports remain
- Modify: `src/domain/exercise-catalog.ts`, `src/lib/exercise-catalog-client.ts`, `src/lib/server-exercise-catalog.ts`, `package.json`, service-worker/cache configuration, `THIRD_PARTY_NOTICES.md`
- Modify: `supabase/schema.sql` and add a new forward migration only if old `catalog_external_id` can be removed after references are gone

**Interfaces:**
- Core programming logic consumes only local `exercises` metadata (`training_direction`, `movement_pattern`, increments and IDs).
- Detail links use `wger_exercise_id` only when a deliberate core mapping exists; an unmapped core action still has local guidance and no fake third-party detail.

- [ ] **Step 1: Write failing isolation tests**

```ts
it("does not require a static catalog external id to offer a same-pattern substitution", () => {
  expect(canSubstitute({ training_direction: "push", movement_pattern: "horizontal_press" }, { training_direction: "push", movement_pattern: "horizontal_press" })).toBe(true);
});

it("has no production import of the removed static catalog loader", async () => {
  expect(await collectProductionImports()).not.toContain("exercise-catalog-client");
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- src/components/exercises src/domain/exercise-catalog.test.ts`

Expected: FAIL while substitution/detail still depend on the static catalog.

- [ ] **Step 3: Decouple local core behavior before removal**

Change substitution eligibility to compare local `training_direction` and `movement_pattern`, never `catalog_external_id`. Add nullable `wger_exercise_id text` to the local core action schema only if the UI needs a deliberate external source link; do not migrate old `hasaneyldrm` IDs into it. When no wger mapping exists, show local movement guidance rather than an unavailable detail action.

- [ ] **Step 4: Remove old catalog artifacts and attribution**

Delete only files confirmed by `rg -l "exercise-catalog|hasaneyldrm|catalog_external_id" src public scripts package.json` to be unused after the refactor. Remove static catalog cache entries and package scripts. Replace the old notice with a concise wger attribution linking to `https://wger.de/api/v2/` and the upstream data/licence reference; do not state that the app bundles wger data.

- [ ] **Step 5: Verify absence and core-plan regression**

Run: `rg -n "hasaneyldrm|exercise-catalog-client|server-exercise-catalog" src public scripts package.json THIRD_PARTY_NOTICES.md`

Expected: no production references to the removed implementation.

Run: `npm test && npm run lint && npm run build`

Expected: PASS. Exercise library search works through the internal route; a Push/Pull/Squat plan still generates and substitutes using local core actions while wger is blocked.

```bash
git add -A
git commit -m "refactor: replace static exercise catalog with wger references"
```

### Task 7: Database, browser, and release verification

**Files:**
- Modify: `README.md` or the existing deployment/runbook document with migration and attribution instructions
- Modify: `docs/superpowers/specs/2026-07-16-wger-external-exercise-reference-design.md` only if implementation reveals a required contract correction

- [ ] **Step 1: Add a precise operator runbook**

Document this release order: deploy database migration; set optional non-secret `WGER_API_BASE_URL=https://wger.de/api/v2/` in Vercel Production and Preview; deploy code; sign in; search/add an external action; record one completed set; inspect history/export; test local plan generation while wger is unavailable. State that no wger token is required.

- [ ] **Step 2: Run all automated checks from a clean worktree**

Run: `npm ci && npm test && npm run lint && npm run build`

Expected: all commands exit 0.

- [ ] **Step 3: Perform browser smoke verification**

1. Sign in and open `/single-workout`; search an English action and a Chinese query.
2. Confirm DevTools/network shows requests only to this application's `/api/exercise-catalog/*`, never `wger.de` from the browser.
3. Add an action, enter kg/reps/RPE, save as draft, reload, then complete it.
4. Confirm history, progress and CSV show the snapshot name and `wger` provider/ID.
5. Temporarily mock/block upstream in local development, retry search, and confirm selected action and sets remain intact.
6. Create/inspect a push/pull/squat plan and PR goal; confirm they still operate from local core actions.

- [ ] **Step 4: Commit release documentation and hand off**

```bash
git add README.md docs/superpowers/specs/2026-07-16-wger-external-exercise-reference-design.md
git commit -m "docs: add wger integration release runbook"
git status --short --branch
```

Expected: a clean feature branch ready for review; do not deploy or merge another task's work without integration review.
