# P0 今日训练与自由训练记录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让新手能从可读的有限动作库安全记录自由训练或周期训练，并在完成前确认训练结果而不改变周期计划。

**Architecture:** 在客户端保留一个有限、产品自有的审核动作定义（不是 wger 目录镜像），自由训练默认从它筛选；只有用户主动输入查询时才调用既有项目服务端 wger 适配器，质量不合格的外部结果一律不展示。自由训练仍通过当前用户范围内的 standalone workout RPC 保存；手动动作采用 `workout_exercises` 的 `manual` 快照，不创建公共动作记录。组校验与完成摘要提取为纯领域逻辑，由自由训练和周期训练共同调用。

**Tech Stack:** Next.js App Router、React、TypeScript、Vitest、Supabase PostgreSQL/RLS、Tailwind CSS、pnpm。

## Global Constraints

- 仅实现 P0-1 至 P0-4；不加入视频、图片、模板、收藏、热身/顶组、离线或社交功能。
- 不复制、同步、长期缓存或写入完整 wger 动作目录；浏览器继续只能请求 `/api/exercise-catalog/*`。
- 审核库为 80–150 个有限、只读的产品定义，每个动作有中文名、英文别名、器械、主要/次要肌群、动作模式、风险标记及负重形式。
- 外部动作必须有可读名称、器械或主要肌群，且不能匹配“肌群 + 训练动作 + 编号”兜底名；外部结果不是默认列表。
- 手动动作只保存到调用者自己的 standalone workout 快照，不写入 `exercises` 或公共审核库；数据库仅使用 `auth.uid()`。
- 自由训练的 `program_id` 永远为 `null`，不能改变 active program 的下一节、状态、建议或重建；历史、进展和 CSV 保持可读。
- 完成组校验：次数为正整数；加重动作还必须有正重量及 1–10 合法 RPE；所有数值拒绝非数字、负数、零次数和超出数据库安全边界的值；失败必须保留输入。
- 所有新增 SQL 仅追加 migration，并同步 `supabase/schema.sql` 与 SQL 契约测试；不改写既有历史。
- 不覆盖其他分支或用户已有改动；本任务独立提交，不合并、不部署。

## File Structure

- `src/domain/reviewed-exercise-library.ts`：有限审核动作及可测的默认列表/本地搜索/风险与负重元数据。
- `src/domain/exercise-selection.ts`：审核、外部与手动动作的可添加判定、稳定排序与分类映射。
- `src/domain/workout-recording.ts`：组字段限制、每组错误、完成摘要（吨位、e1RM、遗漏）的纯函数。
- `src/domain/single-workout.ts`：扩展 standalone payload/draft 解析，支持 `manual` 快照与负重形式。
- `src/components/single-workout/single-workout-recorder.tsx`：默认审核库、补充搜索、手动入口、固定表头、字段错误与结束前摘要。
- `src/components/today/today-workout.tsx`：复用组校验与完成前摘要，维持计划训练的原有推荐逻辑。
- `src/components/dashboard/home-dashboard.tsx`：同时提供“继续今日计划”和“快速记录自由训练”的入口与无计划降级文案。
- `supabase/migrations/20260716150000_p0_workout_recording.sql`：`manual` 快照形状、standalone RPC 输入校验及草稿读取。
- `supabase/schema.sql`、`supabase/tests/standalone_workout_drafts.test.sql`：迁移同构定义及 owner/RPC/手动动作回归验证。

---

### Task 1: 审核动作库与可添加搜索规则（P0-1）

**Files:**
- Create: `src/domain/reviewed-exercise-library.ts`
- Create: `src/domain/exercise-selection.ts`
- Create: `src/domain/reviewed-exercise-library.test.ts`
- Create: `src/domain/exercise-selection.test.ts`
- Modify: `src/domain/external-exercise-search.ts`
- Modify: `src/lib/wger-client.ts`

**Interfaces:**
- Produces `ReviewedExercise`, `reviewedExercises`, `searchReviewedExercises(query, section)` and `filterAddableExternalExercises(results, query, section)`.
- `ReviewedExercise` includes `{ id, nameZh, aliasesZh, nameEn, equipment, primaryMuscles, secondaryMuscles, movementPattern, riskLevel, loadType }` where `loadType` is `weighted | bodyweight | assisted`.
- `filterAddableExternalExercises` returns only addable external references and orders Chinese exact / alias / English / primary-muscle / remaining external results.

- [ ] **Step 1: Write failing domain tests**

```ts
expect(searchReviewedExercises("卧推", "全部")[0]).toMatchObject({ nameZh: "杠铃卧推" });
expect(searchReviewedExercises("", "腿")).toEqual(expect.arrayContaining([
  expect.objectContaining({ nameZh: "杠铃深蹲", movementPattern: "深蹲" })
]));
expect(filterAddableExternalExercises([
  { name: "其他肌群训练动作 42", muscles: [], equipment: [], /* ... */ }
], "", "全部")).toEqual([]);
```

- [ ] **Step 2: Run RED tests**

Run: `pnpm vitest run src/domain/reviewed-exercise-library.test.ts src/domain/exercise-selection.test.ts`  
Expected: FAIL because modules/functions do not exist.

- [ ] **Step 3: Implement finite product definitions and quality filters**

Create 80–150 concise product-owned entries, do not import wger data. Implement deterministic normalized Chinese/English matching, seven section mapping, and external rejection for blank/fallback/no-metadata names. Update `wger-client` to return `null` for an unreadable upstream record rather than fabricating a fallback label.

- [ ] **Step 4: Run GREEN tests**

Run: `pnpm vitest run src/domain/reviewed-exercise-library.test.ts src/domain/exercise-selection.test.ts src/lib/wger-client.test.ts`  
Expected: PASS; existing server-side URL restrictions remain covered.

- [ ] **Step 5: Commit**

```bash
git add src/domain/reviewed-exercise-library.ts src/domain/exercise-selection.ts src/domain/reviewed-exercise-library.test.ts src/domain/exercise-selection.test.ts src/domain/external-exercise-search.ts src/lib/wger-client.ts
git commit -m "feat: add reviewed exercise selection"
```

### Task 2: Standalone manual snapshots and strict database validation (P0-1/P0-3)

**Files:**
- Modify: `src/domain/single-workout.ts`
- Modify: `src/domain/single-workout.test.ts`
- Create: `supabase/migrations/20260716150000_p0_workout_recording.sql`
- Modify: `supabase/schema.sql`
- Modify: `supabase/tests/standalone_workout_drafts.test.sql`

**Interfaces:**
- `buildStandaloneWorkoutSavePayload` serializes `local`, `wger`, or `manual` exercise snapshots without user IDs.
- A `manual` snapshot uses `exercise_id = null`, `exercise_provider = 'manual'`, a generated opaque identifier, readable name, and metadata limited to optional equipment/muscles/loadType.
- `save_standalone_workout` verifies caller ownership on update, accepts only local/wger/manual reference shapes, and rejects invalid completed set data before write.

- [ ] **Step 1: Write failing tests**

```ts
expect(buildStandaloneWorkoutSavePayload(date, [manualExercise]).exercises[0])
  .toMatchObject({ exercise_provider: "manual", exercise_name_snapshot: "酒店健身房划船" });
```

```sql
select throws_ok(
  $$select public.save_standalone_workout('{"status":"completed","exercises":[{"exercise_provider":"manual","exercise_name_snapshot":"徒手划船","sets":[{"completed":true,"reps":"","weight":"","rpe":""}]}]}'::jsonb)$$,
  'P0001', 'completed standalone set requires repetitions'
);
```

- [ ] **Step 2: Run RED tests**

Run: `pnpm vitest run src/domain/single-workout.test.ts`  
Expected: FAIL because manual snapshots are unsupported. Run the Supabase test harness for `standalone_workout_drafts.test.sql`; expected SQL assertion failure until migration is applied locally.

- [ ] **Step 3: Implement smallest compatible migration and serializer**

Allow only `manual` snapshots with bounded name/metadata and an opaque per-record identifier. Extend the RPC draft JSON so manual load type restores. Validate completed sets by load type, while drafts may retain incomplete fields. Keep `auth.uid()` caller-only semantics and synchronize the full final definitions/permissions into `schema.sql`.

- [ ] **Step 4: Run GREEN tests**

Run: `pnpm vitest run src/domain/single-workout.test.ts` and the SQL test harness for `supabase/tests/standalone_workout_drafts.test.sql`.  
Expected: manual payload, owner isolation, update-in-place and invalid completed-set assertions PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/single-workout.ts src/domain/single-workout.test.ts supabase/migrations/20260716150000_p0_workout_recording.sql supabase/schema.sql supabase/tests/standalone_workout_drafts.test.sql
git commit -m "feat: validate standalone workout records"
```

### Task 3: Shared group validation and completion summary (P0-3/P0-4)

**Files:**
- Create: `src/domain/workout-recording.ts`
- Create: `src/domain/workout-recording.test.ts`
- Modify: `src/components/today/today-workout.tsx`

**Interfaces:**
- `validateRecordedSet(set, loadType)` returns keyed field errors without mutating the draft.
- `buildCompletionSummary(sets)` returns `{ completedSetCount, incompleteSetCount, totalTonnage: number | null, bestE1rm: number | null }`; e1RM uses a documented Epley calculation only when valid weighted values exist.
- `CompletionSummaryDialog` is opened before final completion; it exposes `返回继续记录` and `仍然结束训练` when incomplete groups exist.

- [ ] **Step 1: Write failing tests**

```ts
expect(validateRecordedSet({ completed: true, reps: "", weight: "50", rpe: "8" }, "weighted").reps)
  .toContain("次数");
expect(validateRecordedSet({ completed: true, reps: "5", weight: "50", rpe: "11" }, "weighted").rpe)
  .toContain("1–10");
expect(buildCompletionSummary(validAndIncompleteSets)).toMatchObject({ completedSetCount: 2, incompleteSetCount: 1, totalTonnage: 500 });
```

- [ ] **Step 2: Run RED tests**

Run: `pnpm vitest run src/domain/workout-recording.test.ts`  
Expected: FAIL because shared validation/summary module does not exist.

- [ ] **Step 3: Implement pure logic and route plan completion through confirmation**

Use safe numeric limits compatible with `numeric` DB columns, retain all existing inputs on validation failure, render fixed table headers, show field errors alongside each input, and replace direct plan completion with “validate → summary → explicit confirm → existing persistence/recommendations”. Preserve post-completion recommendations and no-op metrics as `不适用`.

- [ ] **Step 4: Run GREEN tests**

Run: `pnpm vitest run src/domain/workout-recording.test.ts src/components/today/today-workout.test.tsx`  
Expected: PASS; plan completion writes only after explicit confirmation.

- [ ] **Step 5: Commit**

```bash
git add src/domain/workout-recording.ts src/domain/workout-recording.test.ts src/components/today/today-workout.tsx
git commit -m "feat: confirm validated workout completion"
```

### Task 4: Rebuild free workout recorder UX (P0-1/P0-3/P0-4)

**Files:**
- Modify: `src/components/single-workout/single-workout-recorder.tsx`
- Create: `src/components/single-workout/single-workout-recorder.test.tsx`
- Modify: `src/domain/external-exercise-search.ts`

**Interfaces:**
- Recorder defaults to `searchReviewedExercises("", selectedSection)`; fetches wger only for non-empty explicit searches.
- `addExercise` accepts only a `ReviewedExercise`, validated wger reference, or manual input and prevents duplicates.
- `requestCompletion` validates without saving; `confirmCompletion` is the only call with `status: 'completed'`.

- [ ] **Step 1: Write failing component tests**

```tsx
render(<SingleWorkoutRecorder />);
expect(screen.getByText("自由训练")).toBeVisible();
expect(screen.getByText("杠铃卧推")).toBeVisible();
expect(screen.getByText("重量 (kg)")).toBeVisible();
await user.click(screen.getByRole("button", { name: "完成训练" }));
expect(screen.getByText("本次训练摘要")).toBeVisible();
```

- [ ] **Step 2: Run RED tests**

Run: `pnpm vitest run src/components/single-workout/single-workout-recorder.test.tsx`  
Expected: FAIL because the recorder has no default reviewed list/table header/summary dialog.

- [ ] **Step 3: Implement mobile-safe recorder**

Render the fixed `自由训练` label and required boundary text at the top. Render audited local action details first, mark external items `待确认动作`, require an explicit details/source view before add, offer manual dialog only when result quality is insufficient, and use compact 320px-safe labelled rows. Surface field errors without clearing state. Show the summary before completion and only then invoke the existing RPC; retain draft save behavior.

- [ ] **Step 4: Run GREEN tests**

Run: `pnpm vitest run src/components/single-workout/single-workout-recorder.test.tsx src/domain/single-workout.test.ts src/domain/workout-recording.test.ts`  
Expected: PASS; no direct browser wger requests are introduced.

- [ ] **Step 5: Commit**

```bash
git add src/components/single-workout/single-workout-recorder.tsx src/components/single-workout/single-workout-recorder.test.tsx src/domain/external-exercise-search.ts
git commit -m "feat: make free workout recording safe"
```

### Task 5: Homepage boundary and end-to-end regression (P0-2)

**Files:**
- Modify: `src/components/dashboard/home-dashboard.tsx`
- Modify: `src/components/dashboard/home-dashboard.test.tsx`
- Modify: `src/components/exercises/exercise-library.tsx`
- Modify: `src/components/exercises/exercise-library.test.tsx`
- Modify: `docs/14_p0_today_workout_recording_requirements.md` only if an implementation evidence section is already established.

**Interfaces:**
- When a plan workout exists, homepage exposes distinct `继续今日计划` → `/today` and `快速记录自由训练` → `/single-workout` links.
- Without a plan workout, homepage exposes `快速记录自由训练` and `创建周期计划`, never a false `/today` next workout.

- [ ] **Step 1: Write failing tests**

```tsx
expect(screen.getByRole("link", { name: "继续今日计划" })).toHaveAttribute("href", "/today");
expect(screen.getByRole("link", { name: "快速记录自由训练" })).toHaveAttribute("href", "/single-workout");
```

- [ ] **Step 2: Run RED tests**

Run: `pnpm vitest run src/components/dashboard/home-dashboard.test.tsx src/components/exercises/exercise-library.test.tsx`  
Expected: FAIL because current dashboard combines the primary action and the library has no audited default list.

- [ ] **Step 3: Implement boundaries and audited default browse**

Keep program next-workout selection program-scoped. Make the free route copy unambiguous. Update the browse page to use the same local audited list by default, external search only after an explicit query, and never show unavailable fallback names.

- [ ] **Step 4: Run targeted regressions and commit**

Run: `pnpm vitest run src/components/dashboard/home-dashboard.test.tsx src/components/exercises/exercise-library.test.tsx src/domain/next-program-workout.test.ts src/domain/training-metric-workouts.test.ts`  
Expected: PASS; standalone work remains included in metrics but not in plan next-workout selection.

```bash
git add src/components/dashboard/home-dashboard.tsx src/components/dashboard/home-dashboard.test.tsx src/components/exercises/exercise-library.tsx src/components/exercises/exercise-library.test.tsx
git commit -m "feat: separate free and planned training"
```

### Task 6: Full verification and authenticated smoke evidence

**Files:**
- Modify: `docs/superpowers/plans/2026-07-16-p0-today-workout-recording.md` (check completed tasks and append evidence)

- [ ] **Step 1: Run database and automated verification**

Run: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm release:check`, and the project Supabase SQL test harness.  
Expected: all project checks pass; any unrelated baseline warning is recorded with its command/output and not hidden.

- [ ] **Step 2: Run authenticated browser smoke**

Verify at 320px and desktop: home has two distinct actions; default free workout list uses readable audited Chinese entries; unreadable external results never render/add; manual action stays in owner history only; invalid completed group retains input and shows local error; summary shows set count/tonnage/e1RM/incomplete count; confirming free workout does not change plan next workout; plan completion also presents a summary.

- [ ] **Step 3: Record evidence and final commit**

Append actual command outcomes, SQL migration name, browser routes and observed boundary checks. Do not deploy or merge.

```bash
git add docs/superpowers/plans/2026-07-16-p0-today-workout-recording.md
git commit -m "docs: record P0 workout verification"
```

## Plan Self-Review

- **Spec coverage:** Task 1 covers finite audited actions, readable external filtering, ordering and details. Task 2 covers caller-owned manual snapshots and RPC/RLS validation. Tasks 3–4 cover field labels, validation retention and both completion summaries. Task 5 covers homepage/training boundaries and default browse. Task 6 covers full automation and authenticated browser checks.
- **No placeholders:** all tasks identify concrete files, interfaces, RED/GREEN commands, expected outcomes and commits.
- **Type consistency:** reviewed/external/manual exercise inputs flow through `single-workout.ts`; set validation and summary use the shared `workout-recording.ts` interface in both recorder pages.

## Implementation Evidence — 2026-07-16

- [x] Task 1: `ad4b4ad feat: add reviewed exercise selection` — 80 product-owned reviewed actions; unreadable/metadata-free wger entries are not returned; targeted tests: 12 passed.
- [x] Task 2: `be88440 feat: validate standalone workout records` — `manual`/`reviewed` workout snapshots, owner-bound standalone RPC updates, completed-set database validation, migration and `schema.sql` parity; TypeScript + SQL contract tests: 13 passed.
- [x] Task 3/4: `0231d25 feat: make workout recording safe` — shared group validation/summary; free-training boundary, audited default action list, explicit wger search, manual action entry, fixed set headers, field errors and completion confirmation; periodic training now also confirms a summary before final write.
- [x] Task 5: same UI commit — homepage exposes `继续今日计划` and `快速记录自由训练` separately, while no-plan state preserves free training plus `创建周期计划`.

### Automated verification

- `pnpm test`: PASS — 46 files / 178 tests passed; 1 existing skipped.
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm build`: PASS.
- `pnpm release:check`: PASS.
- `pnpm test:db`: BLOCKED by local infrastructure, not assertions: `127.0.0.1:54322` refused the PostgreSQL connection. `supabase/tests/standalone_workout_drafts.test.sql` must be run after a local Supabase start or against an approved test environment.

### Remaining environment checks

- Authenticated browser smoke remains to be run in an environment with Supabase credentials/session: free workout at 320px, draft restore, valid/invalid completed sets, completion summary, history/progress/CSV visibility, and active-program next-workout invariance.
- The required database migration is `supabase/migrations/20260716150000_p0_workout_recording.sql`; it has not been applied to any remote database by this task.
- This branch has not been merged, pushed, or deployed by design.
