# 训练执行闭环（第一阶段）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让新手到初级力量训练者以「今日训练 → 当前动作 → 按计划完成工作组 → 获得下一次建议」的最短路径完成训练，并沉淀可靠数据。

**Architecture:** 保持 Next.js App Router、Supabase 和现有 `TodayWorkout` 数据加载路径。新增纯领域函数处理训练界面视图、计划快捷完成和建议门槛；将 UI 拆成小型今日训练子组件，复用既有草稿、休息计时、校验、历史和 Fitness Coach 逻辑。

**Tech Stack:** Next.js 15、React 19、TypeScript、Tailwind CSS、Supabase、Vitest、jsdom、lucide-react。

## Global Constraints

- 移动端优先，单位固定为 kg；桌面布局只能是移动布局的扩展。
- 一堂训练保持单一训练方向；不得把不相关的高强度主项混入同一日。
- 完成的力量工作组必须记录重量、次数和 1–10 的 RPE；有氧规则保持现有例外。
- 首屏不加入饮食、社交、挑战、泛化 AI 对话或完整周期自动顺延。
- 所有新行为先有失败测试，再写最小实现；每个任务独立通过测试后提交。

---

## File Structure

- Create: `src/domain/training-execution.ts` — 计算今日训练重点、当前/下一动作、快捷组完成和训练总结的单一纯函数入口。
- Create: `src/domain/training-execution.test.ts` — 覆盖上述领域规则的 Vitest 单测。
- Create: `src/components/today/today-training-overview.tsx` — 今日训练摘要和当前/下一动作聚焦视图。
- Create: `src/components/today/today-training-overview.test.tsx` — 聚焦视图的渲染与交互测试。
- Create: `src/components/today/set-log-quick-actions.tsx` — 「按计划完成」、RPE 快捷选项和偏离计划编辑入口。
- Create: `src/components/today/set-log-quick-actions.test.tsx` — 快捷记录控件的 DOM 行为测试。
- Modify: `src/components/today/today-workout.tsx` — 将现有加载、草稿、保存和计时状态接入新领域函数与子组件，保留 Supabase 查询职责。
- Modify: `src/components/today/today-workout.test.tsx` — 为现有缓存恢复测试补充今日摘要断言。
- Modify: `src/components/today/today-workout-coach.test.tsx` — 覆盖不自动加重的主项建议门槛。
- Modify: `src/domain/exercise-catalog-names.ts` — 把当前审核中文名称扩展为可显示目录元数据。
- Create: `src/domain/reviewed-exercise-catalog.ts` — 定义审核目录、默认可展示过滤和中文搜索别名。
- Create: `src/domain/reviewed-exercise-catalog.test.ts` — 阻止不可读外部兜底名称进入默认目录。
- Modify: `src/components/single-workout/single-workout-recorder.tsx` — 默认展示审核目录/最近动作，外部目录仅作为明确搜索补充。
- Modify: `src/components/single-workout/single-workout-recorder.test.tsx` — 覆盖无可读名称、搜索与已选动作行为。

## Task 1: 审核动作目录与默认可读结果

**Files:**
- Create: `src/domain/reviewed-exercise-catalog.ts`
- Create: `src/domain/reviewed-exercise-catalog.test.ts`
- Modify: `src/domain/exercise-catalog-names.ts`
- Modify: `src/components/single-workout/single-workout-recorder.tsx`
- Test: `src/domain/reviewed-exercise-catalog.test.ts`, `src/components/single-workout/single-workout-recorder.test.tsx`

**Interfaces:**
- Consumes: `reviewedExerciseNamesZh` and `ExternalExerciseReference`.
- Produces: `reviewedExerciseCatalog`, `isDisplayableCatalogExercise(reference)`, `searchReviewedCatalog(query, section)`.

- [ ] **Step 1: 写失败的领域测试，定义可展示动作规则。**

```ts
import { describe, expect, it } from "vitest";
import { isDisplayableCatalogExercise, searchReviewedCatalog } from "./reviewed-exercise-catalog";

it("excludes fallback provider names from the default catalog", () => {
  expect(isDisplayableCatalogExercise({ externalId: "374", name: "其他肌群训练动作 374", provider: "wger" } as never)).toBe(false);
});

it("finds reviewed Chinese aliases before external results", () => {
  expect(searchReviewedCatalog("卧推", "胸")[0]?.name).toBe("卧推");
});
```

- [ ] **Step 2: 运行测试确认失败。**

Run: `pnpm vitest run src/domain/reviewed-exercise-catalog.test.ts`

Expected: FAIL because `reviewed-exercise-catalog` does not exist.

- [ ] **Step 3: 实现最小审核目录。**

```ts
export type ReviewedExercise = { aliases: readonly string[]; equipment: readonly string[]; externalId: string; muscles: readonly string[]; name: string; section: "胸" | "背" | "腿" | "肩" | "手臂" | "核心" | "全身" };

export function isDisplayableCatalogExercise(reference: { externalId: string; name: string }) {
  return reviewedExerciseCatalog.some((exercise) => exercise.externalId === reference.externalId)
    || !/^其他(?:肌群|器械)?训练动作\s+\d+$/.test(reference.name);
}

export function searchReviewedCatalog(query: string, section: ReviewedExercise["section"] | "全部") {
  const normalized = query.trim().toLocaleLowerCase();
  return reviewedExerciseCatalog.filter((exercise) => (section === "全部" || exercise.section === section)
    && (!normalized || [exercise.name, ...exercise.aliases].some((value) => value.toLocaleLowerCase().includes(normalized))));
}
```

填充当前 `reviewedExerciseNamesZh` 的每个动作，至少补齐别名、器械、主肌群与部位；不要为未审核 Wger 条目编造中文名。

- [ ] **Step 4: 让自由训练默认使用审核目录。**

在 `SingleWorkoutRecorder` 中将空查询的 `results` 渲染为 `searchReviewedCatalog("", category)` 映射出的本地动作；当用户输入关键词后，合并审核结果与 `filterExternalExerciseSearchResults` 的可展示外部结果，并以审核结果优先。外部条目在 `isDisplayableCatalogExercise` 为 false 时过滤掉。

- [ ] **Step 5: 增加组件测试并运行。**

在 `single-workout-recorder.test.tsx` 断言初始列表显示「卧推」且不显示「其他肌群训练动作 374」；输入「bench」断言「卧推」仍排在第一个结果。

Run: `pnpm vitest run src/domain/reviewed-exercise-catalog.test.ts src/components/single-workout/single-workout-recorder.test.tsx`

Expected: PASS.

- [ ] **Step 6: 提交任务。**

```bash
git add src/domain/exercise-catalog-names.ts src/domain/reviewed-exercise-catalog.ts src/domain/reviewed-exercise-catalog.test.ts src/components/single-workout/single-workout-recorder.tsx src/components/single-workout/single-workout-recorder.test.tsx
git commit -m "feat: prioritize reviewed exercise catalog"
```

## Task 2: 建立训练执行领域视图与建议门槛

**Files:**
- Create: `src/domain/training-execution.ts`
- Create: `src/domain/training-execution.test.ts`
- Modify: `src/components/today/today-workout-coach.test.tsx`
- Test: `src/domain/training-execution.test.ts`, `src/components/today/today-workout-coach.test.tsx`

**Interfaces:**
- Consumes: 每个动作的 `id`, `orderIndex`, `name`, `targetSets`, `targetWeight`, `targetReps`, `trainingDirection` 与每组实际日志。
- Produces: `buildTrainingExecutionFocus(input)`, `completeSetAsPlanned(log)`, `canAutoIncreaseMainLift(logs)`.

- [ ] **Step 1: 写失败测试。**

```ts
it("focuses the first incomplete exercise and exposes only its next exercise", () => {
  expect(buildTrainingExecutionFocus(input)).toMatchObject({ currentExerciseId: "bench", nextExerciseId: "row" });
});

it("does not allow a main-lift increase when the final completed set is RPE 9", () => {
  expect(canAutoIncreaseMainLift([{ completed: true, rpe: 9 }])).toBe(false);
});

it("copies prescription values when a user completes a set as planned", () => {
  expect(completeSetAsPlanned({ target_weight: 70, target_reps: 5 })).toMatchObject({ actual_weight: 70, actual_reps: 5, completed: true });
});
```

- [ ] **Step 2: 运行领域测试确认失败。**

Run: `pnpm vitest run src/domain/training-execution.test.ts`

Expected: FAIL because the module has not been created.

- [ ] **Step 3: 实现纯函数。**

`buildTrainingExecutionFocus` 按 `orderIndex` 找第一个存在未完成组的动作；若全部完成，两个 ID 均为 `null`。`completeSetAsPlanned` 只复制处方重量/次数并设置 `completed: true`，保留现有 RPE 以便用户选择。`canAutoIncreaseMainLift` 仅在每组完成、最后完成组 RPE 为有限数且 `<= 8` 时返回 `true`。

- [ ] **Step 4: 将现有 Fitness Coach 测试补为安全门槛。**

在 `today-workout-coach.test.tsx` 添加主项末组 RPE 为 9、以及存在未完成组时的断言；两种场景期待推荐类型不是 `increase`。

- [ ] **Step 5: 运行测试。**

Run: `pnpm vitest run src/domain/training-execution.test.ts src/components/today/today-workout-coach.test.tsx`

Expected: PASS.

- [ ] **Step 6: 提交任务。**

```bash
git add src/domain/training-execution.ts src/domain/training-execution.test.ts src/components/today/today-workout-coach.test.tsx
git commit -m "feat: add safe training execution rules"
```

## Task 3: 动作总览与当前动作聚焦 UI

**Files:**
- Create: `src/components/today/today-training-overview.tsx`
- Create: `src/components/today/today-training-overview.test.tsx`
- Modify: `src/components/today/today-workout.tsx`
- Modify: `src/components/today/today-workout.test.tsx`
- Test: `src/components/today/today-training-overview.test.tsx`, `src/components/today/today-workout.test.tsx`

**Interfaces:**
- Consumes: `TrainingExecutionFocus`, 已排序动作、组日志、`onSelectExercise(exerciseId)` 与 `onStartCurrentSet()`。
- Produces: `TodayTrainingOverview`，在训练中只突出当前和下一动作。

- [ ] **Step 1: 写失败的组件测试。**

```tsx
render(<TodayTrainingOverview exercises={fixtures} focus={{ currentExerciseId: "bench", nextExerciseId: "row" }} logs={logs} onSelectExercise={vi.fn()} onStartCurrentSet={vi.fn()} />);
expect(screen.getByText("当前 · 杠铃卧推")).toBeTruthy();
expect(screen.getByText("下一动作　坐姿划船")).toBeTruthy();
expect(screen.queryByText("第 3 个动作名称")).toBeNull();
```

- [ ] **Step 2: 运行测试确认失败。**

Run: `pnpm vitest run src/components/today/today-training-overview.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: 创建聚焦组件。**

组件必须显示 `第 n / 总动作数`、已完成组/总组数、当前动作的训练角色/处方/上次表现，以及下一动作摘要。只有用户点击「展开全部动作」时才渲染剩余动作。将「开始第 n 组」绑定到父组件选择当前动作并滚动到该动作记录器。

- [ ] **Step 4: 接入 `TodayWorkout`。**

使用 Task 2 的 `buildTrainingExecutionFocus` 从当前 `exercises` 与 `setLogs` 计算焦点；保留现有 Supabase 查询、草稿恢复和替换动作流程。把原有完整动作卡片列表置于「展开全部动作」之后，避免丢失已存在功能。

- [ ] **Step 5: 运行组件和缓存恢复测试。**

Run: `pnpm vitest run src/components/today/today-training-overview.test.tsx src/components/today/today-workout.test.tsx`

Expected: PASS.

- [ ] **Step 6: 提交任务。**

```bash
git add src/components/today/today-training-overview.tsx src/components/today/today-training-overview.test.tsx src/components/today/today-workout.tsx src/components/today/today-workout.test.tsx
git commit -m "feat: focus today workout on current exercise"
```

## Task 4: 快捷完成工作组、RPE 快捷选择与草稿恢复

**Files:**
- Create: `src/components/today/set-log-quick-actions.tsx`
- Create: `src/components/today/set-log-quick-actions.test.tsx`
- Modify: `src/components/today/today-workout.tsx`
- Test: `src/components/today/set-log-quick-actions.test.tsx`, `src/components/today/today-workout.test.tsx`

**Interfaces:**
- Consumes: `targetWeight`, `targetReps`, 当前 `actualWeight`, `actualReps`, `rpe`, `completed` 和回调 `onChange(next)`。
- Produces: `SetLogQuickActions`，提供按计划完成、偏离计划编辑与 RPE 快捷选项。

- [ ] **Step 1: 写失败测试。**

```tsx
const onChange = vi.fn();
render(<SetLogQuickActions targetWeight={70} targetReps={5} actualWeight={null} actualReps={null} rpe={null} completed={false} onChange={onChange} />);
fireEvent.click(screen.getByRole("button", { name: "按计划完成 70kg × 5 次" }));
expect(onChange).toHaveBeenCalledWith({ actual_reps: 5, actual_weight: 70, completed: true });
fireEvent.click(screen.getByRole("button", { name: "RPE 8" }));
expect(onChange).toHaveBeenLastCalledWith({ rpe: 8 });
```

- [ ] **Step 2: 运行测试确认失败。**

Run: `pnpm vitest run src/components/today/set-log-quick-actions.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: 创建控件并接入现有更新函数。**

按钮文案使用完整可访问名称「按计划完成 70kg × 5 次」。点击写入目标重量、次数和完成状态；RPE 由 7、8、9+ 按钮更新为 7、8、9，精确输入保留现有 `NumberInput`。重量/次数编辑保持既有加减和直接输入组件。任何 `onChange` 调用均复用 `TodayWorkout` 现有草稿写入路径，不能新建第二套 localStorage key。

- [ ] **Step 4: 在完成工作组后复用休息计时。**

当快捷完成使组从未完成变为完成时，调用现有启动休息逻辑；重复编辑已完成组不得重新启动计时。为此在 `today-workout.test.tsx` 添加一个使用 fake timers 的断言，确认单次快捷完成将休息文案置为倒计时状态。

- [ ] **Step 5: 运行测试。**

Run: `pnpm vitest run src/components/today/set-log-quick-actions.test.tsx src/components/today/today-workout.test.tsx`

Expected: PASS.

- [ ] **Step 6: 提交任务。**

```bash
git add src/components/today/set-log-quick-actions.tsx src/components/today/set-log-quick-actions.test.tsx src/components/today/today-workout.tsx src/components/today/today-workout.test.tsx
git commit -m "feat: speed up planned set logging"
```

## Task 5: 训练总结的单一下一步建议与发布验证

**Files:**
- Modify: `src/components/today/today-workout.tsx`
- Modify: `src/components/today/today-workout-coach.test.tsx`
- Test: `src/components/today/today-workout-coach.test.tsx`, `src/components/today/today-workout.test.tsx`

**Interfaces:**
- Consumes: `buildCompletionSummary`, Fitness Coach 推荐、Task 2 的主项安全门槛。
- Produces: 单一 `nextStep` 展示模型：`exerciseName`, `suggestedWeight`, `suggestedReps`, `reason`, `status`。

- [ ] **Step 1: 写失败测试。**

```tsx
expect(screen.getByText("已更新下次训练")).toBeTruthy();
expect(screen.getByText("卧推：72.5 kg × 5 × 3")).toBeTruthy();
expect(screen.queryByText("其余动作建议")).toBeNull();
```

- [ ] **Step 2: 运行测试确认失败。**

Run: `pnpm vitest run src/components/today/today-workout-coach.test.tsx`

Expected: FAIL because the summary still renders multiple recommendations or no single next step.

- [ ] **Step 3: 实现单一建议摘要。**

从现有推荐中优先选择当天主项；没有主项时选择首个可执行推荐。展示「已更新下次训练」和明确处方；若规则不允许加重，说明「保持」或「先恢复」，并显示实际原因。保留现有完整建议列表在次级「查看详情」区域，主总结不重复展示。

- [ ] **Step 4: 验证数据回写与历史。**

完成训练后确认现有保存路径仍将全部组日志、摘要和建议状态写入 Supabase；编辑历史后重新计算摘要。只添加覆盖该行为的组件测试，不修改数据库 schema。

- [ ] **Step 5: 运行完整本地验证。**

Run: `pnpm test && pnpm typecheck && pnpm release:check`

Expected: all commands exit 0.

- [ ] **Step 6: 提交任务。**

```bash
git add src/components/today/today-workout.tsx src/components/today/today-workout-coach.test.tsx src/components/today/today-workout.test.tsx
git commit -m "feat: clarify next workout recommendation"
```

## Plan Self-Review

- Spec coverage: Task 1 covers readable reviewed actions; Tasks 2–4 cover current action focus, one-tap planned completion, RPE, validation, timer and drafts; Task 5 covers summary and next-step recommendation. Existing history editing, client cache and Supabase save flow are preserved and explicitly verified.
- Explicit exclusions: no food, social, generic AI, broad templates or cycle rescheduling tasks appear in this plan.
- Type consistency: `TrainingExecutionFocus`, `completeSetAsPlanned`, `canAutoIncreaseMainLift`, `TodayTrainingOverview`, and `SetLogQuickActions` are introduced once and consumed by their exact names.
- Placeholder scan: no deferred implementation markers or unspecified tests remain.
