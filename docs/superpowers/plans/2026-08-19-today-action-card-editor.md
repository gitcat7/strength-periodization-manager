# Today Action Card Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把计划页未完成训练日的密集动作表单改为卡片式编辑，让每个动作都能在自身位置新增、删除、更换和调序。

**Architecture:** 保留现有 `WorkoutPrescriptionDraft`、验证函数和单次 `revise_workout_prescription` RPC。新增纯函数负责插入、删除、恢复和连续重排；新增无数据库职责的动作卡组件负责单卡布局与按需选择器；父编辑器只管理完整草稿、撤销、预览和原子保存。

**Tech Stack:** Next.js 15、React 19、TypeScript、Tailwind CSS、Lucide、Vitest/JSDOM、Supabase RPC。

## Global Constraints

- 仅本人当前活动计划中的 `scheduled` 或 `draft` 训练日可编辑。
- 当训练日已有任意完成组时，不显示结构编辑入口；现有 RPC 继续二次拒绝。
- 动作来源仅限同训练方向的本地审核 `cfg_exercises`；同一天不得重复。
- 动作数量必须为 1–12；至少保留一个动作。
- 新增动作默认 2 组、8 次、0kg，并插入所点击动作之后。
- 取消编辑不得写数据库；确认保存只能调用一次 `revise_workout_prescription`。
- 不新增 SQL migration，不修改 schema、RPC、训练算法、History、Progress、e1RM、Coach 或 CSV 语义。
- 桌面和 375/390/430px 宽度均不得横向溢出；动作控件至少 44px。

---

### Task 1: 建立动作草稿插入、删除和撤销纯函数

**Files:**
- Modify: `src/domain/workout-prescription-editor.ts`
- Modify: `src/domain/workout-prescription-editor.test.ts`

**Interfaces:**
- Consumes: `WorkoutPrescriptionExerciseDraft[]`
- Produces: `reindexPrescriptionExercises(exercises)`
- Produces: `insertPrescriptionExerciseAfter(exercises, anchorIndex, exercise)`
- Produces: `removePrescriptionExerciseAt(exercises, index)`
- Produces: `restorePrescriptionExercise(exercises, removal)`
- Produces: `PrescriptionExerciseRemoval = { exercise: WorkoutPrescriptionExerciseDraft; index: number }`

- [ ] **Step 1: 写插入、删除、恢复和边界失败测试**

在 `src/domain/workout-prescription-editor.test.ts` 导入新函数，并添加：

```ts
it("inserts after the selected action and keeps order indexes contiguous", () => {
  const current = [exercise(), exercise({ exerciseId: "squat-2", orderIndex: 2 })];
  const inserted = insertPrescriptionExerciseAfter(
    current,
    0,
    exercise({ exerciseId: "squat-3", name: "腿举", orderIndex: 99, targetSets: 2, targetReps: 8, targetWeight: 0 })
  );
  expect(inserted.map((item) => [item.exerciseId, item.orderIndex])).toEqual([
    ["squat-1", 1],
    ["squat-3", 2],
    ["squat-2", 3]
  ]);
});

it("removes an action and restores it to the original position", () => {
  const current = [exercise(), exercise({ exerciseId: "squat-2", orderIndex: 2 })];
  const result = removePrescriptionExerciseAt(current, 0);
  expect(result?.exercises.map((item) => item.exerciseId)).toEqual(["squat-2"]);
  expect(restorePrescriptionExercise(result!.exercises, result!.removal)).toEqual(current);
});

it("refuses to remove the final action or insert beyond twelve actions", () => {
  expect(removePrescriptionExerciseAt([exercise()], 0)).toBeNull();
  const twelve = Array.from({ length: 12 }, (_, index) => exercise({ exerciseId: `squat-${index}`, orderIndex: index + 1 }));
  expect(insertPrescriptionExerciseAfter(twelve, 0, exercise({ exerciseId: "extra" }))).toEqual(twelve);
});
```

- [ ] **Step 2: 运行领域测试确认 RED**

Run: `pnpm vitest run src/domain/workout-prescription-editor.test.ts`

Expected: FAIL，提示新函数未导出。

- [ ] **Step 3: 实现最小纯函数**

在 `src/domain/workout-prescription-editor.ts` 添加：

```ts
export type PrescriptionExerciseRemoval = {
  exercise: WorkoutPrescriptionExerciseDraft;
  index: number;
};

export function reindexPrescriptionExercises(exercises: WorkoutPrescriptionExerciseDraft[]) {
  return exercises.map((exercise, index) => ({ ...exercise, orderIndex: index + 1 }));
}

export function insertPrescriptionExerciseAfter(
  exercises: WorkoutPrescriptionExerciseDraft[],
  anchorIndex: number,
  exercise: WorkoutPrescriptionExerciseDraft
) {
  if (exercises.length >= MAX_EXERCISES || anchorIndex < 0 || anchorIndex >= exercises.length) return exercises;
  const next = [...exercises];
  next.splice(anchorIndex + 1, 0, exercise);
  return reindexPrescriptionExercises(next);
}

export function removePrescriptionExerciseAt(exercises: WorkoutPrescriptionExerciseDraft[], index: number) {
  if (exercises.length <= MIN_EXERCISES || index < 0 || index >= exercises.length) return null;
  const removal = { exercise: { ...exercises[index] }, index };
  return { exercises: reindexPrescriptionExercises(exercises.filter((_, currentIndex) => currentIndex !== index)), removal };
}

export function restorePrescriptionExercise(exercises: WorkoutPrescriptionExerciseDraft[], removal: PrescriptionExerciseRemoval) {
  if (exercises.length >= MAX_EXERCISES) return exercises;
  const next = [...exercises];
  next.splice(Math.min(removal.index, next.length), 0, removal.exercise);
  return reindexPrescriptionExercises(next);
}
```

- [ ] **Step 4: 运行领域测试确认 GREEN**

Run: `pnpm vitest run src/domain/workout-prescription-editor.test.ts`

Expected: PASS，现有验证和摘要测试继续通过。

- [ ] **Step 5: 提交领域层**

```powershell
git add src/domain/workout-prescription-editor.ts src/domain/workout-prescription-editor.test.ts
git commit -m "feat: manage workout prescription draft actions"
```

### Task 2: 建立可读的单动作编辑卡

**Files:**
- Create: `src/components/plan/workout-prescription-exercise-card.tsx`
- Create: `src/components/plan/workout-prescription-exercise-card.test.tsx`

**Interfaces:**
- Consumes: `WorkoutPrescriptionExerciseDraft`、当天方向、已使用动作 ID、当前序号和总数
- Produces: `WorkoutPrescriptionCatalogExercise = { id: string; slug: string; name: string; training_direction?: PrescriptionDirection | null }`
- Produces callbacks: `onChange(patch)`, `onMove(delta)`, `onRemove()`, `onInsertAfter(catalogExercise)`
- Owns: `pickerMode: "replace" | "insert" | null`

- [ ] **Step 1: 写卡片布局失败测试**

创建 JSDOM 测试，渲染一张“深蹲”卡并断言：

```tsx
expect(container.textContent).toContain("深蹲");
expect(container.querySelector('select[aria-label="第 1 个动作"]')).toBeNull();
expect(findButton("更换动作").className).toContain("h-11");
expect(findButton("删除动作").className).toContain("h-11");
expect(findButton("在此动作后新增").className).toContain("h-11");

act(() => findButton("更换动作").click());
expect(container.querySelector('select[aria-label="更换深蹲"]')).not.toBeNull();

act(() => findButton("在此动作后新增").click());
expect(container.querySelector('select[aria-label="在深蹲后新增动作"]')).not.toBeNull();
```

另测：`totalExercises=1` 时删除禁用且 `title="至少保留一个动作"`；`totalExercises=12` 时新增禁用且 `title="每个训练日最多 12 个动作"`；同方向已使用动作不出现在选项中。

- [ ] **Step 2: 运行组件测试确认 RED**

Run: `pnpm vitest run src/components/plan/workout-prescription-exercise-card.test.tsx`

Expected: FAIL，组件文件不存在。

- [ ] **Step 3: 实现无数据库职责的动作卡**

组件导出 `WorkoutPrescriptionCatalogExercise` 类型，并使用 `Pencil`、`ArrowUp`、`ArrowDown`、`Trash2`、`Plus`、`X`。默认标题区域仅渲染动作名称和 `formatPrescription` 等价的组次重量文本，不渲染 `<select>`；点击“更换动作”或“在此动作后新增”后才渲染对应选择器。三个数值输入继续使用：

```tsx
<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
  <label>组数<input className="mt-1 h-11 w-full min-w-0 ..." /></label>
  <label>次数<input className="mt-1 h-11 w-full min-w-0 ..." /></label>
  <label>重量 kg<input className="mt-1 h-11 w-full min-w-0 font-mono tabular-nums ..." /></label>
</div>
```

操作区在窄屏使用 `flex flex-wrap gap-2`，所有按钮 `h-11`；删除使用带文字的红色描边按钮，新增使用整行虚线描边按钮。选择动作后立即调用 callback 并关闭选择器。

- [ ] **Step 4: 运行卡片测试确认 GREEN**

Run: `pnpm vitest run src/components/plan/workout-prescription-exercise-card.test.tsx`

Expected: PASS，默认 DOM 无常驻替换下拉框，44px、删除和按位置新增断言通过。

- [ ] **Step 5: 提交动作卡**

```powershell
git add src/components/plan/workout-prescription-exercise-card.tsx src/components/plan/workout-prescription-exercise-card.test.tsx
git commit -m "feat: add workout prescription action cards"
```

### Task 3: 将卡片、按位置新增和删除撤销接入原子编辑器

**Files:**
- Modify: `src/components/plan/workout-prescription-editor.tsx`
- Modify: `src/components/plan/workout-prescription-editor.test.tsx`
- Modify: `src/components/plan/program-manager.test.tsx`

**Interfaces:**
- Consumes Task 1 pure functions and Task 2 `WorkoutPrescriptionExerciseCard`
- Preserves: `revise_workout_prescription` single RPC, `clearWorkoutPrescriptionCaches(workoutId)`, `onSaved()`

- [ ] **Step 1: 扩展父编辑器失败测试**

把 fixture 扩展为三个 squat 动作和第四个可选动作，覆盖：

```ts
expect(container.querySelectorAll('[data-prescription-exercise-card]')).toHaveLength(3);
expect(findButtons("删除动作")).toHaveLength(3);
expect(findButtons("在此动作后新增")).toHaveLength(3);
expect(container.querySelectorAll('select[aria-label^="第 "]')).toHaveLength(0);

act(() => findButtons("在此动作后新增")[0].click());
act(() => selectOption('select[aria-label="在深蹲后新增动作"]', "squat-4"));
expect(cardNames()).toEqual(["深蹲", "腿屈伸", "前蹲", "腿举"]);

act(() => findButtons("删除动作")[1].click());
expect(container.textContent).toContain("已删除腿屈伸");
act(() => findButton("撤销删除").click());
expect(cardNames()).toEqual(["深蹲", "腿屈伸", "前蹲", "腿举"]);
```

保存测试必须断言 `rpc` 仅一次，`p_payload.exercises` 顺序与卡片一致；取消测试断言 `rpc` 为 0；RPC 返回错误时卡片、输入值和撤销提示仍存在。

在 `program-manager.test.tsx` 保留/补充：训练日有完成组时 DOM 不含“编辑本日动作”。

- [ ] **Step 2: 运行编辑器测试确认 RED**

Run: `pnpm vitest run src/components/plan/workout-prescription-editor.test.tsx src/components/plan/program-manager.test.tsx`

Expected: FAIL，旧编辑器只有全局新增入口和常驻动作 select。

- [ ] **Step 3: 接入动作卡与撤销状态**

父组件删除原有 `PrescriptionEditorCatalogExercise` 类型，改为从 `workout-prescription-exercise-card.tsx` 导入 `WorkoutPrescriptionCatalogExercise` 和 `WorkoutPrescriptionExerciseCard`。随后新增：

```ts
const [lastRemoval, setLastRemoval] = useState<PrescriptionExerciseRemoval | null>(null);

function removeExercise(index: number) {
  if (!draft) return;
  const result = removePrescriptionExerciseAt(draft.exercises, index);
  if (!result) return;
  setLastRemoval(result.removal);
  setDraft({ ...draft, exercises: result.exercises });
}

function undoRemoval() {
  if (!draft || !lastRemoval) return;
  setDraft({ ...draft, exercises: restorePrescriptionExercise(draft.exercises, lastRemoval) });
  setLastRemoval(null);
}

function insertExerciseAfter(index: number, item: WorkoutPrescriptionCatalogExercise) {
  setDraft((current) => current ? {
    ...current,
    exercises: insertPrescriptionExerciseAfter(current.exercises, index, {
      exerciseId: item.id,
      slug: item.slug,
      name: item.name,
      direction: item.training_direction ?? current.direction,
      orderIndex: index + 2,
      targetSets: 2,
      targetReps: 8,
      targetWeight: 0,
      provider: "local"
    })
  } : current);
  setLastRemoval(null);
}
```

用 `WorkoutPrescriptionExerciseCard` 替换旧的常驻 `<select>`/图标行，删除全局“添加本地动作”选择器。删除后渲染：

```tsx
{lastRemoval ? (
  <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm">
    <span>已删除 {lastRemoval.exercise.name}，保存前仍可撤销。</span>
    <button className="h-11 rounded-lg border border-line px-3 font-semibold" onClick={undoRemoval} type="button">撤销删除</button>
  </div>
) : null}
```

预览摘要一次计算 `getPrescriptionChangeSummary(before, draft.exercises)`，显示新增、删除、调序和参数变化。取消或保存成功时清空 `lastRemoval`；失败时不得清空草稿。

- [ ] **Step 4: 运行编辑器与计划页测试确认 GREEN**

Run: `pnpm vitest run src/components/plan/workout-prescription-exercise-card.test.tsx src/components/plan/workout-prescription-editor.test.tsx src/components/plan/program-manager.test.tsx`

Expected: PASS，所有动作卡有新增/删除，按位置插入、撤销、单 RPC 和完成组锁定通过。

- [ ] **Step 5: 提交编辑器集成**

```powershell
git add src/components/plan/workout-prescription-editor.tsx src/components/plan/workout-prescription-editor.test.tsx src/components/plan/program-manager.test.tsx
git commit -m "feat: edit every scheduled workout action inline"
```

### Task 4: 回归数据链路、移动端契约并完成发布门禁

**Files:**
- Modify only if a real regression is exposed: `src/components/today/today-workout.test.tsx`
- Modify only if a real regression is exposed: `src/components/history/training-history.test.tsx`
- Modify only if a real regression is exposed: `src/components/progress/progress-dashboard.test.tsx`
- Modify only if a real regression is exposed: `src/domain/fitness-coach.test.ts`
- No migration or schema files

**Interfaces:**
- Verifies the existing `plan_workout_exercises -> Today -> log_set_logs -> History/Progress/Coach` chain without changing it

- [ ] **Step 1: 运行针对性回归**

```powershell
pnpm vitest run src/domain/workout-prescription-editor.test.ts src/components/plan/workout-prescription-exercise-card.test.tsx src/components/plan/workout-prescription-editor.test.tsx src/components/plan/program-manager.test.tsx src/components/today/today-workout.test.tsx src/components/history/training-history.test.tsx src/components/progress/progress-dashboard.test.tsx src/domain/fitness-coach.test.ts
```

Expected: PASS；若出现真实数据链路回归，只修改对应测试或最小兼容代码，并重新执行同一命令。

- [ ] **Step 2: 静态核验移动端和范围**

Run:

```powershell
rg -n "h-11|min-w-0|grid-cols-1|sm:grid-cols-3|在此动作后新增|删除动作" src/components/plan/workout-prescription-*.tsx
git diff --name-only fe1515c...HEAD
git diff --check
```

Expected: 动作按钮均为 44px；数值输入有 `min-w-0`；差异只包含规格、计划、领域层、计划动作编辑组件及其测试，无 SQL/RPC/schema 文件。

- [ ] **Step 3: 运行全量门禁**

```powershell
pnpm test
$env:NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='local-release-check-placeholder'
pnpm release:check
git diff --check
```

Expected: 全量 Vitest 通过；typecheck、Next 生产构建、14 路由本地 smoke 通过；仅允许既有明确 skipped tests。

- [ ] **Step 4: 提交最终测试证据并推送固定提交**

```powershell
git add src docs/superpowers/specs/2026-08-19-today-action-card-editor-design.md docs/superpowers/plans/2026-08-19-today-action-card-editor.md
git commit -m "test: verify today action card editing"
git push -u origin claude/today-action-card-editor
```

如果没有额外测试文件改动，不创建空提交；直接推送前序固定提交。

- [ ] **Step 5: 独立验收与生产发布**

通知测试窗口固定 commit，要求复跑 focused、`pnpm test`、`pnpm release:check`，并静态/真实浏览器核验所有动作卡新增删除、完成组锁定和 375/390/430px 无溢出。测试明确“验证通过”前禁止部署。

测试通过后从固定干净提交执行：

```powershell
vercel deploy --prod --force --yes
$env:BASE_URL='https://strength-periodization-manager.vercel.app'
pnpm smoke
```

Expected: Vercel `production/READY`、alias 绑定正式域名、meta.gitCommitSha 等于固定 commit、14/14 路由和 `/api/health` 通过。最后通知架构窗口做真实登录态计划页验收。
