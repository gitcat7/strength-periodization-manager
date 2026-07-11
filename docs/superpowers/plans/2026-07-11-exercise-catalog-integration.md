# Exercise Catalog Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the pinned 1,324-record `hasaneyldrm/exercises-dataset` text catalog into the Web/PWA, today-workout details and controlled accessory substitution, and authenticated Agent API without weakening user isolation or existing programming.

**Architecture:** A deterministic build script normalizes the pinned upstream JSON into a commit-addressed public artifact and checksum manifest. Browser and server loaders validate the bytes before exposing a shared search/detail domain model; Supabase stores only reviewed program-capable bridge rows and performs substitutions through one ownership-checked transaction. The Web UI lazy-loads catalog data, while Agent actions read the same verified artifact on the server.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript 5.6, Supabase/PostgreSQL RLS and RPC, Tailwind CSS, Zod, Vitest, Python `unittest`, Service Worker Cache API, Vercel.

## Global Constraints

- Source repository is exactly `https://github.com/hasaneyldrm/exercises-dataset.git` at commit `118e4bd6b14da6df0e36605d7169b65db18389a4`.
- The generated catalog contains exactly 1,324 records and is named `exercises.118e4bd6.zh.json`.
- The catalog contains text only: never copy, package or hotlink source images, GIFs, `image`, `gif_url`, `media_id`, or `attribution` fields.
- Product units remain kg only; the push/pull/squat A-B schedule and existing exercise UUIDs remain unchanged.
- Only reviewed program exercises enter Supabase; the full catalog stays in `public/exercise-catalog/` and out of the initial JavaScript bundle.
- Unreviewed catalog records display `nameEn`; only IDs in `reviewedExerciseNamesZh` display a Chinese reviewed name.
- `cardio_zone2` uses local reviewed guidance and no misleading catalog mapping.
- Main and secondary positions (`order_index < 3`) and any exercise with a completed set cannot be substituted.
- Replacement scopes are `current_workout` and `remaining_program`; the default UI scope is `current_workout`.
- Any replacement resets `target_weight` to `0`, preserves target sets/reps, removes incomplete pre-created logs and is atomic.
- RPC and Agent APIs derive identity from `auth.uid()` or the bearer token and never accept a `user_id`.
- Catalog failures are isolated: training execution and recording must remain usable.
- Every production-code behavior follows red-green-refactor TDD; no implementation is written before its focused test fails for the expected reason.

## Reviewed Program Mapping

The migration and reviewed-name map use this exact initial allowlist:

| Slug | Catalog ID | Chinese name | Direction | Pattern | Replaceable |
| --- | --- | --- | --- | --- | --- |
| `bench_press` | `0025` | 卧推 | push | horizontal_press | false |
| `overhead_press` | `0091` | 推举 | push | vertical_press | true |
| `incline_dumbbell_press` | `0314` | 上斜哑铃卧推 | push | horizontal_press | true |
| `lateral_raise` | `0334` | 侧平举 | push | shoulder_abduction | true |
| `triceps_pushdown` | `0201` | 绳索下压 | push | elbow_extension | true |
| `barbell_row` | `0027` | 杠铃划船 | pull | horizontal_pull | false |
| `lat_pulldown` | `2330` | 高位下拉 | pull | vertical_pull | true |
| `seated_cable_row` | `0861` | 坐姿划船 | pull | horizontal_pull | true |
| `face_pull` | `0233` | 面拉 | pull | rear_delt | true |
| `dumbbell_curl` | `0294` | 哑铃弯举 | pull | elbow_flexion | true |
| `back_squat` | `0043` | 深蹲 | squat | knee_dominant | false |
| `romanian_deadlift` | `0085` | 罗马尼亚硬拉 | squat | hip_hinge | true |
| `leg_press` | `0739` | 腿举 | squat | knee_dominant | true |
| `leg_curl` | `0599` | 腿弯举 | squat | knee_flexion | true |
| `standing_calf_raise` | `0605` | 站姿提踵 | squat | calf_raise | true |
| `pull_up` | `0652` | 引体向上 | pull | vertical_pull | true |
| `deadlift` | `0032` | 硬拉 | pull | hip_hinge | false |
| `machine_chest_press` | `0577` | 器械推胸 | push | horizontal_press | true |
| `machine_shoulder_press` | `0603` | 器械肩推 | push | vertical_press | true |
| `cable_lateral_raise` | `0178` | 绳索侧平举 | push | shoulder_abduction | true |
| `rope_triceps_pushdown` | `0200` | 绳索把手下压 | push | elbow_extension | true |
| `machine_seated_row` | `1350` | 器械坐姿划船 | pull | horizontal_pull | true |
| `neutral_grip_lat_pulldown` | `0818` | 对握高位下拉 | pull | vertical_pull | true |
| `cable_reverse_fly` | `0225` | 绳索反向飞鸟 | pull | rear_delt | true |
| `cable_biceps_curl` | `0868` | 绳索弯举 | pull | elbow_flexion | true |
| `machine_hack_squat` | `0743` | 哈克深蹲 | squat | knee_dominant | true |
| `dumbbell_romanian_deadlift` | `1459` | 哑铃罗马尼亚硬拉 | squat | hip_hinge | true |
| `lying_leg_curl` | `0586` | 俯卧腿弯举 | squat | knee_flexion | true |
| `cable_standing_calf_raise` | `1375` | 绳索站姿提踵 | squat | calf_raise | true |

`cardio_zone2` remains an 18th existing exercise with `training_direction='cardio'`, `movement_pattern='aerobic_base'`, `substitution_enabled=false`, and `catalog_external_id=null`.

---

### Task 1: Establish the automated test and catalog generation foundation

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `vitest.config.ts`
- Create: `scripts/exercise-catalog-core.mjs`
- Create: `scripts/exercise-catalog-core.test.mjs`
- Create: `scripts/sync-exercise-catalog.mjs`
- Create: `scripts/verify-exercise-catalog.mjs`
- Create: `scripts/fixtures/exercise-catalog-valid.json`
- Create: `public/exercise-catalog/manifest.json`
- Create: `public/exercise-catalog/exercises.118e4bd6.zh.json`
- Create: `THIRD_PARTY_NOTICES.md`
- Modify: `README.md`

**Interfaces:**
- Produces: `normalizeCatalog(source: unknown): ExerciseCatalogRecord[]`
- Produces: `buildManifest(bytes: Uint8Array): ExerciseCatalogManifest`
- Produces: `verifyCatalogArtifacts({ manifestPath, dataPath }): Promise<void>`
- Produces: deterministic public artifacts consumed by every later task.

- [ ] **Step 1: Add Vitest and scripts, then write failing normalization tests**

Add `vitest` as a dev dependency and these scripts:

```json
{
  "scripts": {
    "catalog:sync": "node scripts/sync-exercise-catalog.mjs",
    "catalog:verify": "node scripts/verify-exercise-catalog.mjs",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Create tests that assert: a valid fixture normalizes, records sort by `externalId`, `instructions.zh` becomes `instructionsZh`, duplicate IDs fail, missing Chinese instructions fail, a non-1,324 production input fails, and forbidden output fields never survive. Export the pure helpers from `scripts/exercise-catalog-core.mjs` so the tests do not invoke the network.

- [ ] **Step 2: Run the focused test and verify the expected red state**

Run: `pnpm vitest run scripts/exercise-catalog-core.test.mjs`

Expected: FAIL because `scripts/exercise-catalog-core.mjs` does not exist or its exports are missing.

- [ ] **Step 3: Implement deterministic normalization and verification**

Implement these exact constants and normalized shape:

```js
export const SOURCE_COMMIT = "118e4bd6b14da6df0e36605d7169b65db18389a4";
export const SOURCE_REPOSITORY = "https://github.com/hasaneyldrm/exercises-dataset.git";
export const SOURCE_COMMIT_TIME = "2026-07-09T18:10:06Z";
export const RECORD_COUNT = 1324;
export const DATA_FILE = "exercises.118e4bd6.zh.json";

// Output keys in this exact order for reproducible JSON.
{
  bodyPart,
  category,
  equipment,
  externalId,
  instructionsZh,
  muscleGroup,
  nameEn,
  nameZh: null,
  secondaryMuscles,
  target
}
```

`normalizeCatalog` must reject non-arrays, any count other than 1,324 unless `{ expectedCount }` is explicitly passed by a unit test, blank required strings, duplicate IDs, missing `instructions.zh`, and malformed `secondary_muscles`. It must never copy arbitrary keys. `buildManifest` computes SHA-256 over the exact UTF-8 JSON bytes and uses `generatedAt: SOURCE_COMMIT_TIME`.

`sync-exercise-catalog.mjs` fetches only the raw URL at the pinned commit, validates fully, writes `.tmp` files in `public/exercise-catalog`, verifies those temporary files, and then atomically renames both. A failure removes temporary files and leaves prior artifacts untouched.

- [ ] **Step 4: Run tests, sync the pinned catalog and verify artifacts**

Run:

```powershell
pnpm vitest run scripts/exercise-catalog-core.test.mjs
pnpm catalog:sync
pnpm catalog:verify
```

Expected: all tests pass; sync reports `1324`; verification prints the fixed commit, filename and checksum, and exits 0.

- [ ] **Step 5: Add licensing notice and prove no media is distributed**

`THIRD_PARTY_NOTICES.md` must reproduce the upstream MIT copyright/permission notice for Hasan Emir Yıldırım, identify the pinned commit and source URL, and state that Gym visual media is excluded and no `images/` or `videos/` content is distributed. Add a README link to the notice.

Run:

```powershell
rg -n 'image|gif_url|media_id|attribution|images/|videos/' public/exercise-catalog
```

Expected: no matches.

- [ ] **Step 6: Commit the independently reproducible catalog foundation**

```powershell
git add package.json pnpm-lock.yaml vitest.config.ts scripts public/exercise-catalog THIRD_PARTY_NOTICES.md README.md
git commit -m "feat: add verified static exercise catalog"
```

### Task 2: Build shared catalog types, search and integrity-checked loaders

**Files:**
- Create: `src/domain/exercise-catalog.ts`
- Create: `src/domain/exercise-catalog.test.ts`
- Create: `src/domain/exercise-catalog-names.ts`
- Create: `src/domain/exercise-guidance.ts`
- Create: `src/domain/exercise-guidance.test.ts`
- Create: `src/lib/exercise-catalog-client.ts`
- Create: `src/lib/exercise-catalog-client.test.ts`
- Create: `src/lib/server-exercise-catalog.ts`
- Create: `src/lib/server-exercise-catalog.test.ts`

**Interfaces:**
- Produces: `ExerciseCatalogRecord`, `ExerciseCatalogManifest`, `ExerciseCatalogFilters`, `ExerciseCatalogSummary`.
- Produces: `filterExerciseCatalog(records, { query, bodyPart, equipment, target, muscleGroup, programOnly, programExternalIds, limit })`.
- Produces: `findExerciseCatalogRecord(records, externalId)`.
- Produces: `loadExerciseCatalog(): Promise<ExerciseCatalogRecord[]>`, `loadExerciseCatalogRecord(externalId)` and `clearExerciseCatalogVerificationState()`.
- Produces: server-only `getServerExerciseCatalog()` and `getServerExerciseCatalogRecord(externalId)`.

- [ ] **Step 1: Write failing search, reviewed-name and local-guidance tests**

Tests must prove composed filters; case-insensitive matching across ID, English name, reviewed Chinese name, equipment, body part, target and muscle group; stable ID ordering; program-only allowlist; limit enforcement; `cardio_zone2` local guidance; and null for unknown local slugs. Include the 29 reviewed IDs from the mapping table.

- [ ] **Step 2: Run focused tests and verify red**

Run: `pnpm vitest run src/domain/exercise-catalog.test.ts src/domain/exercise-guidance.test.ts`

Expected: FAIL because the domain modules are absent.

- [ ] **Step 3: Implement pure catalog domain behavior**

Use the exact public types from the approved design. `reviewedExerciseNamesZh` is a frozen `Readonly<Record<string,string>>` containing all 29 IDs above. Search normalizes text using `trim().toLocaleLowerCase()` and caps only when a limit is supplied. A summary omits full instructions; detail retains them.

Local Zone 2 guidance returns:

```ts
{
  externalId: null,
  nameEn: "Zone 2 cardio",
  nameZh: "Zone 2 有氧",
  equipment: "自选有氧器械",
  target: "心肺基础与恢复",
  instructionsZh: "以可以完整说短句、但呼吸明显加快的强度持续训练。优先保持稳定节奏，不追求冲刺；如出现胸痛、眩晕或异常气短，立即停止。"
}
```

- [ ] **Step 4: Write failing loader integrity and fallback tests**

Inject `fetchImpl`, `cryptoImpl`, and a storage adapter. Tests must prove: catalog is lazy; checksum mismatch rejects current bytes; a verified previous manifest can be used as fallback; malformed JSON does not replace the verified pointer; concurrent calls share one promise; clear removes only the catalog verification key. Server tests use temporary files and prove checksum validation plus memoization.

- [ ] **Step 5: Run loader tests and verify red**

Run: `pnpm vitest run src/lib/exercise-catalog-client.test.ts src/lib/server-exercise-catalog.test.ts`

Expected: FAIL because loaders are absent.

- [ ] **Step 6: Implement browser and server loaders**

The browser loader fetches `/exercise-catalog/manifest.json` with `cache: "no-cache"`, fetches the manifest data file, hashes its raw `ArrayBuffer`, compares lowercase SHA-256, parses only after verification and validates the array shape/count. Store only the last verified manifest under `strength-training-exercise-catalog:last-verified`. The server loader resolves files with `path.join(process.cwd(), "public", "exercise-catalog", ...)`, reads raw bytes, verifies SHA-256 and caches the fulfilled catalog promise.

- [ ] **Step 7: Run all focused tests and commit**

```powershell
pnpm vitest run src/domain/exercise-catalog.test.ts src/domain/exercise-guidance.test.ts src/lib/exercise-catalog-client.test.ts src/lib/server-exercise-catalog.test.ts
git add src/domain src/lib/exercise-catalog-client* src/lib/server-exercise-catalog*
git commit -m "feat: add verified exercise catalog domain"
```

### Task 3: Add catalog runtime caching without changing training navigation

**Files:**
- Modify: `public/sw.js`
- Modify: `next.config.mjs`
- Modify: `src/components/settings/settings-panel.tsx`
- Create: `scripts/service-worker-contract.test.mjs`

**Interfaces:**
- Consumes: `clearExerciseCatalogVerificationState()` from Task 2.
- Produces: network-first manifest and cache-first immutable data behavior in a dedicated `strength-periodization-catalog-v1` cache.

- [ ] **Step 1: Write a failing service-worker contract test**

Read `public/sw.js` as text and assert: catalog data is absent from `PRECACHE_URLS`; exact manifest path routes to `networkFirst`; `/exercise-catalog/exercises.` routes to `cacheFirst`; a dedicated catalog cache constant exists; `/api/` remains bypassed. Read `next.config.mjs` and assert the manifest has `no-cache, must-revalidate` while versioned JSON has `public, max-age=31536000, immutable`.

- [ ] **Step 2: Run the contract test and verify red**

Run: `pnpm vitest run scripts/service-worker-contract.test.mjs`

Expected: FAIL because catalog cache rules are missing.

- [ ] **Step 3: Implement exact runtime routes and cache headers**

Increment shell cache to `strength-periodization-v5`, keep catalog cache stable as `strength-periodization-catalog-v1`, route manifest before generic static handling, and await `cache.put`. Do not delete the catalog cache during normal SW activation. In Settings, call both `clearExerciseCatalogVerificationState()` and existing cache deletion when the user chooses “清理本地缓存”.

- [ ] **Step 4: Run focused tests, typecheck and commit**

```powershell
pnpm vitest run scripts/service-worker-contract.test.mjs src/lib/exercise-catalog-client.test.ts
pnpm typecheck
git add public/sw.js next.config.mjs src/components/settings/settings-panel.tsx scripts/service-worker-contract.test.mjs
git commit -m "feat: cache verified exercise catalog at runtime"
```

### Task 4: Add the reviewed Supabase bridge and atomic substitution RPC

**Files:**
- Create: `supabase/migrations/20260711190000_exercise_catalog_bridge.sql`
- Modify: `supabase/schema.sql`
- Create: `supabase/tests/substitute_workout_exercise.test.sql`
- Create: `scripts/exercise-catalog-sql-contract.test.mjs`
- Create: `src/domain/exercise-substitution.ts`
- Create: `src/domain/exercise-substitution.test.ts`

**Interfaces:**
- Produces: `ExerciseSubstitutionScope = "current_workout" | "remaining_program"`.
- Produces: `isExerciseSubstitutionEligible({ workoutStatus, orderIndex, hasCompletedSet, source, alternatives })`.
- Produces RPC: `substitute_workout_exercise(p_workout_exercise_id uuid, p_target_exercise_id uuid, p_scope workout_exercise_substitution_scope)` returning `affected_ids uuid[], affected_count integer`.

- [ ] **Step 1: Write failing TS eligibility and SQL contract tests**

Eligibility tests cover `scheduled|draft`, reject `completed|skipped`, reject positions 1–2, completed logs, disabled/unmapped source and no compatible alternatives. SQL contract tests assert `security definer`, `set search_path = public`, `auth.uid()`, active-program ownership, direction/pattern equality, `order_index >= 3`, completed-log guard, row locking, incomplete-log deletion, weight reset, grants only to authenticated, and no `user_id` parameter.

- [ ] **Step 2: Run tests and verify red**

Run: `pnpm vitest run src/domain/exercise-substitution.test.ts scripts/exercise-catalog-sql-contract.test.mjs`

Expected: FAIL because migration/domain files do not exist.

- [ ] **Step 3: Implement the schema bridge and reviewed seeds**

Add nullable unique `catalog_external_id`, constrained nullable `training_direction`, nullable `movement_pattern`, non-null `substitution_enabled default false`, and `workout_exercises.updated_at`. Update the 18 existing rows and insert the 12 alternatives from the approved mapping table with category matching direction, conservative increments (`2.5` compound/cable, `1.0` isolation), and `is_main_lift=false`. Mirror the final schema and seeds in `supabase/schema.sql`.

- [ ] **Step 4: Implement the ownership-checked transaction**

The RPC must:

```sql
-- Security shape required in the final function.
security definer
set search_path = public
```

1. Reject null `auth.uid()`.
2. Lock and load the source row joined through workout/program and require caller ownership, active program, workout `scheduled|draft`, position >= 3, mapped/enabled source.
3. Load mapped/enabled target and require same direction and movement pattern and a different exercise ID.
4. Select affected rows `for update`: current only, or current/future rows in the same program with source exercise, direction, movement pattern and the same `order_index`, restricted to `scheduled|draft` and scheduled date >= source date.
5. Reject the whole call if any affected row has a completed set.
6. Delete all incomplete logs for affected IDs, update `exercise_id`, `target_weight=0`, `updated_at=now()`, return sorted IDs/count.
7. `revoke execute ... from public, anon; grant execute ... to authenticated`.

- [ ] **Step 5: Add pgTAP scenarios and run available database checks**

The SQL test must cover both scopes, cross-user, unauthenticated, inactive program, positions 1–2, completed/skipped workouts, incompatible direction/pattern, disabled target, same target, completed-set rollback, sets/reps preservation, log deletion and exact affected count.

Run:

```powershell
pnpm vitest run src/domain/exercise-substitution.test.ts scripts/exercise-catalog-sql-contract.test.mjs
supabase test db
```

Expected: Vitest passes. If local Supabase CLI/Docker is unavailable, record that as an environment limitation but do not treat the RPC as production-verified; the same pgTAP assertions must run against the linked database after migration deployment.

- [ ] **Step 6: Commit the database contract**

```powershell
git add supabase src/domain/exercise-substitution* scripts/exercise-catalog-sql-contract.test.mjs
git commit -m "feat: add atomic accessory substitution RPC"
```

### Task 5: Build the authenticated exercise library and shared details UI

**Files:**
- Create: `src/app/exercises/page.tsx`
- Create: `src/components/exercises/exercise-library.tsx`
- Create: `src/components/exercises/exercise-catalog-list.tsx`
- Create: `src/components/exercises/exercise-detail-panel.tsx`
- Create: `src/components/exercises/exercise-detail-launcher.tsx`
- Create: `src/components/exercises/exercise-library-state.test.ts`
- Modify: `src/components/dashboard/home-dashboard.tsx`
- Modify: `src/components/settings/settings-panel.tsx`

**Interfaces:**
- Consumes: catalog loader/search from Task 2 and approved bridge rows from Supabase.
- Produces: `ExerciseDetailPanel({ record, localGuidance, open, onClose })` and `ExerciseDetailLauncher({ catalogExternalId, exerciseSlug, exerciseName })`.

- [ ] **Step 1: Extract and test pure library state derivation**

Test filter options, selected-record retention, program-only filtering from Supabase `catalog_external_id`s, empty state, and first-result selection. Run and observe failure before implementing the state helper.

- [ ] **Step 2: Implement `/exercises` authentication and lazy catalog load**

The page uses the existing secondary-page shell. `ExerciseLibrary` checks the Supabase session and redirects to `/login?next=/exercises`; only after authentication does it call `loadExerciseCatalog()` and query `exercises(catalog_external_id)` where not null. Loading/corruption/offline/empty states remain inside the page and include a retry button.

- [ ] **Step 3: Implement responsive list, filters and accessible details**

Search input plus body-part, equipment, target and program-availability controls must use semantic inputs/selects. Mobile renders a stable compact list and bottom sheet; desktop uses `grid-template-columns: minmax(0,1fr) 360px`. The panel has a labelled close icon, returns focus to the trigger, locks body scroll while modal on mobile, renders bilingual reviewed title, equipment, target, secondary muscles, Chinese instructions, beginner cue and source/license links. No media placeholder is rendered.

- [ ] **Step 4: Add authenticated Home and Settings entry points**

Add a compact `BookOpen` icon/link labelled `动作库` after dashboard metrics and a full-width Settings section after account/profile. Do not alter the five-item bottom nav.

- [ ] **Step 5: Run focused tests, typecheck and build**

```powershell
pnpm vitest run src/components/exercises/exercise-library-state.test.ts src/domain/exercise-catalog.test.ts
pnpm typecheck
pnpm build
```

Expected: all pass and build output contains `/exercises` without embedding the 15 MB source JSON in a JavaScript chunk.

- [ ] **Step 6: Commit the exercise library**

```powershell
git add src/app/exercises src/components/exercises src/components/dashboard/home-dashboard.tsx src/components/settings/settings-panel.tsx
git commit -m "feat: add searchable exercise library"
```

### Task 6: Show instructions and controlled replacement in Today Workout

**Files:**
- Modify: `src/components/today/today-workout.tsx`
- Create: `src/components/today/exercise-substitution-dialog.tsx`
- Create: `src/components/today/exercise-substitution-dialog-state.ts`
- Create: `src/components/today/exercise-substitution-dialog-state.test.ts`
- Modify: `src/lib/analytics.ts`
- Modify: `src/lib/client-cache.ts`
- Create: `src/lib/client-cache.test.ts`

**Interfaces:**
- Consumes: `ExerciseDetailLauncher`, substitution domain, Supabase RPC.
- Produces: `clearWorkoutDrafts(workoutIds: string[])` and analytics event `exercise_substituted`.

- [ ] **Step 1: Write failing cache and dialog behavior tests**

Tests prove only `strength-training-draft:<workoutId>` keys for affected IDs are removed. A pure `createExerciseSubstitutionDialogState()` reducer proves compatible candidates only, default scope `current_workout`, cancel resets without a request, confirm emits exact source/target/scope, saving disables repeated confirmation, and an error preserves selected values.

- [ ] **Step 2: Run tests and verify red**

Run: `pnpm vitest run src/lib/client-cache.test.ts src/components/today/exercise-substitution-dialog-state.test.ts`

Expected: FAIL because helper/dialog are absent.

- [ ] **Step 3: Extend Today queries and render instruction controls**

Join these exercise fields: `catalog_external_id,training_direction,movement_pattern,substitution_enabled`. Query all compatible reviewed exercise rows once only after Today data is loaded; do not load the 1,324-record catalog until a detail launcher opens. Every mapped strength exercise gets `动作说明`; Zone 2 gets its local guidance launcher.

- [ ] **Step 4: Implement replacement confirmation and RPC reload**

Show `替换动作` only when `isExerciseSubstitutionEligible` passes. Dialog options are `仅本次训练` and `本周期后续同类训练`, with current-only default and an explicit “新动作重量将重置为 0kg” message. On confirm:

```ts
const { data, error } = await supabase.rpc("substitute_workout_exercise", {
  p_workout_exercise_id: source.id,
  p_target_exercise_id: target.id,
  p_scope: scope
});
```

On success clear training caches, clear drafts for returned workout-exercise IDs, record `exercise_substituted` with source/target/scope/count, and rerun the extracted Today loader so client state and pre-created logs are rebuilt for the new exercise. On error show a Chinese message and leave state unchanged.

- [ ] **Step 5: Run focused and full tests, typecheck and build**

```powershell
pnpm vitest run src/domain/exercise-substitution.test.ts src/lib/client-cache.test.ts src/components/today/exercise-substitution-dialog-state.test.ts
pnpm test
pnpm typecheck
pnpm build
```

Expected: all pass; Today remains usable if catalog loading is forced to fail.

- [ ] **Step 6: Commit Today integration**

```powershell
git add src/components/today src/lib/analytics.ts src/lib/client-cache.ts src/lib/client-cache.test.ts
git commit -m "feat: add workout guidance and accessory replacement"
```

### Task 7: Extend the authenticated Agent API and distributed Skill

**Files:**
- Modify: `src/app/api/agent/v1/route.ts`
- Create: `src/app/api/agent/v1/request-schema.ts`
- Create: `src/app/api/agent/v1/request-schema.test.ts`
- Modify: `skills/strength-training-manager/scripts/strength_manager.py`
- Modify: `skills/strength-training-manager/references/commands.md`
- Modify: `skills/strength-training-manager/SKILL.md`
- Create: `skills/strength-training-manager/tests/test_strength_manager.py`

**Interfaces:**
- Consumes: `getServerExerciseCatalog()` and catalog search/detail from Task 2.
- Produces Agent actions `search_exercises` and `exercise_detail`.
- Produces CLI commands `搜索动作 --关键词 ... --数量 ...` and `动作详情 --目录ID ...`.

- [ ] **Step 1: Write failing action-specific schema tests**

Replace the shared permissive schema with a Zod discriminated union. Tests prove search requires nonblank `query`, accepts optional composed filters, caps limit at 20, detail requires a catalog ID, history still caps at 50, action-irrelevant fields are rejected, and existing seven actions retain valid payloads.

- [ ] **Step 2: Run schema tests and verify red**

Run: `pnpm vitest run src/app/api/agent/v1/request-schema.test.ts`

Expected: FAIL because the new schema module is absent.

- [ ] **Step 3: Implement authenticated read actions**

Authenticate before parsing/executing both catalog actions. `search_exercises` returns `{ count, results }` with at most 20 summaries and no full instructions. `exercise_detail` returns `{ exercise }` or the existing `not_found` envelope. Keep `Cache-Control: no-store`; never accept `user_id`; never expose server file paths.

- [ ] **Step 4: Write and run failing Python CLI tests**

Using `unittest`, parse these exact commands and assert payloads:

```text
搜索动作 --关键词 卧推 --数量 5 -> {action:search_exercises,query:卧推,limit:5}
动作详情 --目录ID 0025 -> {action:exercise_detail,external_id:0025}
```

Also assert missing keyword/ID exits with a clear parser error and no token appears in output.

Run: `python -m unittest discover -s skills/strength-training-manager/tests -v`

Expected: FAIL until parser mappings are added.

- [ ] **Step 5: Implement CLI and Skill documentation**

Add arguments `--关键词`, `--目录ID`, `--身体部位`, `--器械`, `--目标肌群`, and reuse `--数量` with client-side validation 1–20 for search. Update the Skill workflow to distinguish catalog external IDs from workout-exercise UUIDs and state that catalog actions are read-only.

- [ ] **Step 6: Run Agent/Skill regression and commit**

```powershell
pnpm vitest run src/app/api/agent/v1/request-schema.test.ts src/domain/exercise-catalog.test.ts
python -m unittest discover -s skills/strength-training-manager/tests -v
pnpm typecheck
git add src/app/api/agent skills/strength-training-manager
git commit -m "feat: expose exercise catalog to training agents"
```

### Task 8: Put catalog integrity and routes into the release gate

**Files:**
- Modify: `scripts/release-check.mjs`
- Modify: `scripts/smoke-check.mjs`
- Create: `scripts/smoke-catalog.test.mjs`
- Modify: `package.json`
- Modify: `docs/12_database_release_runbook.md`
- Modify: `docs/14_agent_skill.md`
- Modify: `docs/11_mvp_release_checklist.md`

**Interfaces:**
- Produces release order: tests → catalog verify → typecheck → build → local start → smoke.
- Produces smoke coverage for `/exercises`, manifest, commit-addressed data, checksum and unauthenticated Agent 401.

- [ ] **Step 1: Write failing smoke helper tests**

Extract a helper that validates a fetched manifest and data bytes. Test wrong record count, wrong data filename, checksum mismatch and valid bytes. The smoke list must include `/exercises`; unauthenticated POST to `/api/agent/v1` must return 401 without leaking details.

- [ ] **Step 2: Run tests and verify red**

Run: `pnpm vitest run scripts/smoke-catalog.test.mjs`

Expected: FAIL because smoke catalog verification is absent.

- [ ] **Step 3: Integrate tests and integrity verification into release**

`release:check` runs `pnpm test`, Python `unittest`, `pnpm catalog:verify`, `pnpm typecheck`, then build/start/smoke. Smoke fetches the manifest, fetches `dataFile`, hashes exact bytes with Node crypto, parses and asserts 1,324 records, fixed commit and no forbidden fields.

- [ ] **Step 4: Update runbooks with exact database and rollback steps**

Document: apply `20260711190000_exercise_catalog_bridge.sql`; verify 29 mapped rows and RPC grants; deploy application; validate both replacement scopes; rollback application without dropping bridge columns; revoke RPC execute if an incident occurs; never remove mapped exercise rows because history references them. Update Agent docs with the two commands.

- [ ] **Step 5: Run the complete local release gate and commit**

```powershell
pnpm release:check
git add scripts package.json docs
git commit -m "test: gate releases on exercise catalog integrity"
```

Expected: all unit, Python, catalog, typecheck, build and local smoke checks pass from a clean checkout.

### Task 9: Deploy the database migration and perform authenticated functional verification

**Files:**
- No production source edits expected; failures return to the owning task under TDD.
- Create: `docs/verification/2026-07-11-exercise-catalog-evidence.md`

**Interfaces:**
- Consumes the linked Supabase project and an authenticated owner test account.
- Produces timestamped evidence for all data, permission and regression acceptance criteria.

- [ ] **Step 1: Apply the migration to the linked Supabase project**

Use the available Supabase SQL/CLI path. Verify `catalog_external_id`, direction, pattern, substitution flag, `workout_exercises.updated_at`, 29 mapped rows, null Zone 2 mapping, RPC grants and no anon execute permission.

- [ ] **Step 2: Verify current-workout replacement with real user data**

Choose an uncompleted accessory with no completed sets. Record before-state IDs/sets/reps/weight/logs, replace with `current_workout`, reload, and prove exactly one row changed, weight is 0, sets/reps are unchanged, incomplete logs were recreated for the target, other workouts are unchanged, and one analytics event exists.

- [ ] **Step 3: Verify remaining-program replacement and rejection atomicity**

Use another compatible accessory and `remaining_program`. Prove current and future matching rows changed while prior, completed, skipped, different-position and different-pattern rows did not. Attempt replacement on a completed set and with an incompatible target; prove the RPC rejects and no row/log changes.

- [ ] **Step 4: Verify user isolation**

With a second authenticated user or a forged source UUID, prove the RPC cannot read or mutate the owner’s workout. With no bearer token, prove both Agent catalog actions return 401. With a valid token, prove search/detail work and existing `today`, `plan`, `history`, `progress`, `pr_goals` still return only that user’s data.

- [ ] **Step 5: Record evidence and commit**

The evidence document records UTC timestamps, commands/actions, sanitized IDs, before/after assertions and pass/fail. Never include tokens, emails, service-role keys or full user UUIDs.

```powershell
git add docs/verification/2026-07-11-exercise-catalog-evidence.md
git commit -m "docs: record exercise catalog integration verification"
```

### Task 10: Run responsive visual checks, deploy production and complete the audit

**Files:**
- Modify only files whose verified behavior fails; each fix requires a failing regression test first.
- Update: `docs/verification/2026-07-11-exercise-catalog-evidence.md`

**Interfaces:**
- Produces production deployment and requirement-by-requirement evidence.

- [ ] **Step 1: Start the verified local app and inspect network behavior**

Run `pnpm dev` on a free port. Confirm the authenticated home and Today pages do not request `/exercise-catalog/exercises.118e4bd6.zh.json` before opening the library/details. Open `/exercises` and prove the manifest and data fetch only then.

- [ ] **Step 2: Capture mobile and desktop visual evidence**

Use the in-app browser at 320×568, 390×844, 768×1024 and 1440×900. Check search/filter wrapping, long English names, list stability, mobile safe-area, detail-panel close/focus behavior, Today action buttons and both substitution scopes. Capture screenshots and browser console; there must be no overlap, horizontal scrolling, uncaught errors or failed assets.

- [ ] **Step 3: Run complete fresh verification immediately before release**

```powershell
pnpm test
python -m unittest discover -s skills/strength-training-manager/tests -v
pnpm catalog:verify
pnpm typecheck
pnpm release:check
git status --short
```

Expected: every command exits 0 and only the planned evidence update is uncommitted.

- [ ] **Step 4: Push, deploy and run production smoke**

```powershell
git push -u origin codex/exercise-catalog-integration
pnpm dlx vercel deploy --prod --yes
$env:BASE_URL='https://strength-periodization-manager.vercel.app'
$env:SMOKE_TRANSPORT='powershell'
pnpm smoke
```

Verify production health, `/exercises`, manifest/data checksum, authenticated search/detail, current Today detail, both real substitution scopes, history, progress, PR, CSV export and Agent today query.

- [ ] **Step 5: Complete the requirement-by-requirement audit**

For each of the eight acceptance criteria in the approved design, link authoritative evidence: generated artifacts/checksum, automated test output, database before/after assertions, browser screenshots, network trace, Agent responses and production smoke. Any missing or indirect evidence is a failure and must return to the owning task before completion is claimed.

- [ ] **Step 6: Final commit/push and branch completion workflow**

```powershell
git add docs/verification/2026-07-11-exercise-catalog-evidence.md
git commit -m "docs: finalize production exercise catalog evidence"
git push
```

Then use `superpowers:requesting-code-review`, address valid findings, rerun the full gate, and use `superpowers:finishing-a-development-branch` to merge or open the final PR according to repository policy.
