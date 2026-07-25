# 目标驱动计划生成一期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让“力量举风格力量提升”与“增肌”成为两条可追溯、可验证的计划生成路线。

**Architecture:** 保留 `program.ts` 中已验证的增肌模板、排期和休息日扩展；新增纯领域的 `powerlifting-program.ts`，根据三项训练最大值生成确定性的三项专项日。由一个目标路由函数选择生成器，计划替换 payload 和 Supabase RPC 保存 `training_goal`、`generation_rule_version`，使现有历史计划不受影响。

**Tech Stack:** Next.js 15、React 19、TypeScript、Vitest、Supabase PostgreSQL/pgTAP、Tailwind CSS。

## Global Constraints

- 移动 Web/PWA 优先，重量单位固定为 kg。
- 一期仅支持 `powerlifting` 和 `hypertrophy`；不实现备赛峰值、开把、极限测试或自动改写周期。
- 力量举路线仅允许每周 3-6 次训练，且要求深蹲、卧推、硬拉均有有效最近工作组。
- 单个力量举训练日只有一个三项主项；其他动作只能服务主项技术、后链、上背、核心或恢复。
- 强度主项为 3-5 组 x 3-6 次、容量/技术主项为 3-4 组 x 5-8 次；第 4 周负荷下调 7.5 个百分点并减少约 40% 工作组。
- 所有业务行为先写失败测试；每个任务通过对应测试后单独提交。
- 不修改或删除现有用户计划、训练记录和 RLS 策略。

---

## 文件结构

- Create: `src/domain/training-goal.ts` — 路线类型、兼容旧 `strength` 值及路线校验。
- Create: `src/domain/powerlifting-program.ts` — 三项频率、动作序列、4 周负荷与减量规则。
- Create: `src/domain/powerlifting-program.test.ts` — 纯领域规则测试。
- Modify: `src/domain/plan-setup.ts` — 按路线校验训练天数与三项工作组。
- Modify: `src/domain/program.ts` — 增加目标路由入口；保持原 `buildFourWeekProgram` 的增肌输出不变。
- Modify: `src/domain/program.test.ts` — 锁定增肌路线回归。
- Modify: `src/domain/program-regeneration.ts` — 将路线和规则版本写入替换 payload。
- Modify: `src/components/plan/program-manager.tsx` — 路线控件、三项必填状态、预览解释和生成接入。
- Modify: `src/components/plan/program-manager.plan-setup.test.tsx` — 表单路线交互测试。
- Create: `src/components/plan/goal-plan-preview.tsx` — 可复用的力量举预览说明。
- Create: `src/components/plan/goal-plan-preview.test.tsx` — 预览渲染测试。
- Create: `supabase/migrations/20260725110000_goal_driven_programs.sql` — 新列、约束及替换 RPC 扩展。
- Create: `supabase/tests/goal_driven_programs.test.sql` — pgTAP 持久化、默认值、隔离测试。
- Modify: `supabase/schema.sql` — 与迁移同步的完整 schema。

### Task 1: 路线类型与创建计划校验

**Files:**
- Create: `src/domain/training-goal.ts`
- Create: `src/domain/training-goal.test.ts`
- Modify: `src/domain/plan-setup.ts`
- Modify: `src/domain/plan-setup.test.ts`

**Interfaces:**
- Produces `TrainingGoal = "powerlifting" | "hypertrophy"`、`normalizeTrainingGoal(value: string): TrainingGoal`、`isPowerliftingTrainingDayCount(value: number): boolean`。
- `PlanSetupInput.goal` 改为 `TrainingGoal`；`validatePlanSetup` 对力量举返回按动作 id 命名的字段错误。

- [ ] **Step 1: 写失败测试，锁定旧值兼容与力量举门槛。**

```ts
expect(normalizeTrainingGoal("strength")).toBe("powerlifting");
expect(isPowerliftingTrainingDayCount(2)).toBe(false);
expect(isPowerliftingTrainingDayCount(3)).toBe(true);

const result = validatePlanSetup({
  ...baseInput({ goal: "powerlifting", trainingDaysPerWeek: 3 }),
  lifts: [workingSet("squat"), workingSet("bench")]
});
expect(result).toMatchObject({ ok: false, fieldErrors: { lifts: "力量举路线需要补齐深蹲、卧推和硬拉的最近工作组" } });
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run src/domain/training-goal.test.ts src/domain/plan-setup.test.ts`

Expected: FAIL，因为 `powerlifting` 类型、路线规范化和专项校验尚不存在。

- [ ] **Step 3: 实现最小路线和校验逻辑。**

```ts
export type TrainingGoal = "powerlifting" | "hypertrophy";
export const powerliftingLiftSlugs = ["back_squat", "bench_press", "deadlift"] as const;

export function normalizeTrainingGoal(value: string): TrainingGoal {
  return value === "strength" || value === "powerlifting" ? "powerlifting" : "hypertrophy";
}

export function isPowerliftingTrainingDayCount(value: number) {
  return Number.isInteger(value) && value >= 3 && value <= 6;
}
```

在 `validatePlanSetup` 中：当 `goal === "powerlifting"`，先检查 3-6 天，再以主项 slug 映射确认三项都存在有效工作组；增肌仍仅要求至少一项有效工作组。

- [ ] **Step 4: 验证通过。**

Run: `pnpm vitest run src/domain/training-goal.test.ts src/domain/plan-setup.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交。**

```bash
git add src/domain/training-goal.ts src/domain/training-goal.test.ts src/domain/plan-setup.ts src/domain/plan-setup.test.ts
git commit -m "feat: validate goal-specific plan setup"
```

### Task 2: 力量举纯领域生成器

**Files:**
- Create: `src/domain/powerlifting-program.ts`
- Create: `src/domain/powerlifting-program.test.ts`
- Modify: `src/domain/program.ts`
- Modify: `src/domain/program.test.ts`

**Interfaces:**
- `buildPowerliftingProgram(input)` 返回 `PlannedScheduleItem[]`，沿用 `ExerciseProfile`、`ScheduleConfig`、`PlannedScheduleItem`。
- `buildGoalDrivenProgram({ goal, ...input })`：`powerlifting` 调用专项生成器，`hypertrophy` 调用现有 `buildFourWeekProgram`。

- [ ] **Step 1: 写失败测试，固定 4 天专项结果。**

```ts
const workouts = buildPowerliftingProgram({
  schedule: { mode: "fixed_weekdays", weekdays: [1, 2, 4, 6] },
  exerciseProfiles: powerliftingProfiles,
  startDate: new Date("2026-07-27T00:00:00"),
  trainingDaysPerWeek: 4,
  weekCount: 4
}).filter((item) => item.dayType === "training");

expect(countMainLift(workouts, "back_squat")).toBe(8);
expect(countMainLift(workouts, "bench_press")).toBe(12);
expect(countMainLift(workouts, "deadlift")).toBe(4);
expect(workouts.every(hasExactlyOnePowerliftingMainLift)).toBe(true);
expect(totalWorkSets(workouts.filter(isWeekFour))).toBeLessThan(totalWorkSets(workouts.filter(isWeekThree)));
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run src/domain/powerlifting-program.test.ts src/domain/program.test.ts`

Expected: FAIL，因为专项生成器和目标路由入口尚不存在。

- [ ] **Step 3: 实现确定性专项循环。**

定义 `PowerliftingDay` 为 `{ name, mainLiftSlug, intent, exercises }`。3 天循环为“深蹲 A + 卧推 B”“卧推 A + 上背”“硬拉 A + 深蹲 B”；4 天加入“卧推 B + 下肢恢复”，5-6 天加入“硬拉 B（技术）”。

使用以下负荷函数，所有负荷经过现有 `roundToNearestPlate`：

```ts
function weekMultiplier(weekIndex: number, intent: "intensity" | "volume") {
  const base = intent === "intensity" ? 0.775 : 0.675;
  if (weekIndex === 1) return base + 0.025;
  if (weekIndex === 2) return base + (intent === "intensity" ? 0.05 : 0.025);
  if (weekIndex === 3) return base - 0.075;
  return base;
}

function deloadSets(sets: number, weekIndex: number) {
  return weekIndex === 3 ? Math.max(2, Math.ceil(sets * 0.6)) : sets;
}
```

不要随机选动作；仅使用存在于核心动作表的 `back_squat`、`bench_press`、`deadlift`、`romanian_deadlift`、`barbell_row`、`lat_pulldown`、`leg_curl`、`leg_press`、`face_pull`、`triceps_pushdown`。缺少任何被引用动作 profile 时，抛出 `计划所需动作缺少训练数据：<slug>`。

- [ ] **Step 4: 接入目标路由并保护增肌回归。**

```ts
export function buildGoalDrivenProgram(input: GoalDrivenProgramInput) {
  if (input.goal === "powerlifting") return buildPowerliftingProgram(input);
  return buildFourWeekProgram(input);
}
```

保留 `buildFourWeekProgram` 的签名和现有输出；新增测试断言 `hypertrophy` 路由与直接调用的结果深度相等。

- [ ] **Step 5: 验证并提交。**

Run: `pnpm vitest run src/domain/powerlifting-program.test.ts src/domain/program.test.ts`

Expected: PASS。

```bash
git add src/domain/powerlifting-program.ts src/domain/powerlifting-program.test.ts src/domain/program.ts src/domain/program.test.ts
git commit -m "feat: generate powerlifting-style programs"
```

### Task 3: 路线选择与生成预览

**Files:**
- Create: `src/components/plan/goal-plan-preview.tsx`
- Create: `src/components/plan/goal-plan-preview.test.tsx`
- Modify: `src/components/plan/program-manager.tsx`
- Modify: `src/components/plan/program-manager.plan-setup.test.tsx`

**Interfaces:**
- `GoalPlanPreview({ goal, trainingDaysPerWeek, weekCount, plannedItems })` 渲染力量举频率和第 4 周减量说明；增肌返回 `null`。
- `PlanSetupForm` 仍接收现有 props，但传入的 `value.goal` 使用 `TrainingGoal`。

- [ ] **Step 1: 写失败组件测试。**

```tsx
render(<PlanSetupForm value={{ ...powerliftingValue }} mainLifts={threeLifts} errors={{}} onChange={onChange} />);
expect(screen.getByText("力量举风格力量提升")).toBeInTheDocument();
expect(screen.getByText("深蹲、卧推、硬拉均为必填")).toBeInTheDocument();
expect(screen.getByRole("option", { name: "2 天" })).toBeDisabled();

render(<GoalPlanPreview goal="powerlifting" trainingDaysPerWeek={4} weekCount={4} plannedItems={items} />);
expect(screen.getByText("卧推每周 3 次")).toBeInTheDocument();
expect(screen.getByText("第 4 周为减量周")).toBeInTheDocument();
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run src/components/plan/goal-plan-preview.test.tsx src/components/plan/program-manager.plan-setup.test.tsx`

Expected: FAIL，因为路线控件与预览组件不存在。

- [ ] **Step 3: 实现无歧义表单状态。**

在 `PlanSetupForm` 中将目标选项改为：

```tsx
<option value="powerlifting">力量举风格力量提升</option>
<option value="hypertrophy">增肌（Hypertrophy）</option>
```

选择 `powerlifting` 时：固定显示三项输入，训练天数 `<select>` 的 1、2、7 天 option 增加 `disabled`，并在控件下显示“深蹲、卧推、硬拉均为必填；计划使用强度日、容量/技术日和第 4 周减量。”选择 `hypertrophy` 时保持当前模板选择与输入行为。

在生成预览中插入 `GoalPlanPreview`，以训练日主项统计显示“深蹲每周 N 次、卧推每周 N 次、硬拉每周 N 次”，并显示“训练重量基于最近工作组估算”。

- [ ] **Step 4: 调整生成调用。**

在 `ProgramManager.generateProgram` 中把当前 `buildFourWeekProgram` 调用替换为：

```ts
const plannedWorkouts = buildGoalDrivenProgram({
  goal: planSetup.goal,
  templateType,
  schedule,
  exerciseProfiles: [...exerciseProfiles, ...accessoryProfiles],
  weekCount: planSetup.weekCount,
  trainingDaysPerWeek: planSetup.trainingDaysPerWeek
});
```

力量举调用不得使用用户选择的增肌模板作为生成依据；界面把模板区域替换为“力量举专项循环”的只读说明。

- [ ] **Step 5: 验证并提交。**

Run: `pnpm vitest run src/components/plan/goal-plan-preview.test.tsx src/components/plan/program-manager.plan-setup.test.tsx src/components/plan/program-manager.test.tsx`

Expected: PASS。

```bash
git add src/components/plan/goal-plan-preview.tsx src/components/plan/goal-plan-preview.test.tsx src/components/plan/program-manager.tsx src/components/plan/program-manager.plan-setup.test.tsx
git commit -m "feat: expose goal-driven plan setup"
```

### Task 4: 保存路线元数据的数据库迁移

**Files:**
- Create: `supabase/migrations/20260725110000_goal_driven_programs.sql`
- Create: `supabase/tests/goal_driven_programs.test.sql`
- Modify: `supabase/schema.sql`
- Modify: `src/domain/program-regeneration.ts`
- Modify: `src/domain/program-regeneration.test.ts`

**Interfaces:**
- `ProgramReplacementPayload` 新增 `training_goal: TrainingGoal` 与 `generation_rule_version: "goal-driven-v1"`。
- `replace_active_program` 从 payload 提取、验证并插入两字段。

- [ ] **Step 1: 写 pgTAP 和 payload 失败测试。**

```sql
select has_column('public', 'programs', 'training_goal');
select col_default_is('public', 'programs', 'training_goal', '''hypertrophy''::text');
select throws_ok(
  $$select * from public.replace_active_program('{"name":"bad","template_type":"three_split","training_goal":"invalid","generation_rule_version":"goal-driven-v1","schedule_mode":"flexible","schedule_config":{},"start_date":"2026-07-27","end_date":"2026-07-27","schedule_items":[]}'::jsonb)$$,
  'P0001',
  'Replacement payload is invalid',
  'invalid route is rejected'
);
```

在 TypeScript 测试中断言 `buildProgramReplacementPayload({ trainingGoal: "powerlifting", ... }).training_goal === "powerlifting"`。

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run src/domain/program-regeneration.test.ts && pnpm test:db -- --file supabase/tests/goal_driven_programs.test.sql`

Expected: FAIL，因为列、payload 字段和 RPC 校验尚不存在。

- [ ] **Step 3: 编写幂等迁移。**

迁移必须包含以下 SQL 语义：

```sql
alter table public.programs
  add column if not exists training_goal text not null default 'hypertrophy',
  add column if not exists generation_rule_version text;

alter table public.programs
  drop constraint if exists programs_training_goal_check,
  add constraint programs_training_goal_check
  check (training_goal in ('powerlifting', 'hypertrophy'));
```

使用 `create or replace function public.replace_active_program(jsonb)` 复制现有函数体，并新增：

```sql
v_training_goal := p_payload ->> 'training_goal';
v_generation_rule_version := nullif(btrim(p_payload ->> 'generation_rule_version'), '');
```

在原 payload 验证条件中加入 `v_training_goal not in ('powerlifting', 'hypertrophy') or v_generation_rule_version <> 'goal-driven-v1'`。在 `insert into public.programs` 的列和值中分别加入 `training_goal, generation_rule_version` 和 `v_training_goal, v_generation_rule_version`。保留函数的认证、锁、日程和动作校验原样不变。

同步更新 `supabase/schema.sql` 中 `programs` 定义与 RPC 定义，确保空库与托管数据库结构一致。

- [ ] **Step 4: 更新 payload 构建器。**

```ts
export type ProgramReplacementPayload = {
  // existing fields
  generation_rule_version: "goal-driven-v1";
  training_goal: TrainingGoal;
};
```

`buildProgramReplacementPayload` 接收 `trainingGoal`，在 return 中写入 `generation_rule_version: "goal-driven-v1"` 与 `training_goal: trainingGoal`。所有调用点传入 `planSetup.goal`。

- [ ] **Step 5: 验证并提交。**

Run: `pnpm vitest run src/domain/program-regeneration.test.ts && pnpm test:db -- --file supabase/tests/goal_driven_programs.test.sql`

Expected: PASS，旧计划查询不要求新列即可读取，新计划可持久化专项路线。

```bash
git add supabase/migrations/20260725110000_goal_driven_programs.sql supabase/tests/goal_driven_programs.test.sql supabase/schema.sql src/domain/program-regeneration.ts src/domain/program-regeneration.test.ts
git commit -m "feat: persist goal-driven program metadata"
```

### Task 5: 端到端回归、发布与验收

**Files:**
- Modify: `scripts/release-check.mjs`（仅当新测试未被现有全量测试覆盖时）
- Modify: `docs/12_database_release_runbook.md`
- Modify: `docs/11_mvp_release_checklist.md`

**Interfaces:**
- 无新增运行时接口；本任务验证前四项交付并记录生产迁移顺序。

- [ ] **Step 1: 添加发布前回归断言。**

在现有 release check 中纳入 `src/domain/powerlifting-program.test.ts`、计划设置组件测试和迁移契约测试；不要把依赖 Docker 的 pgTAP 测试塞入默认前端 lint 步骤。

- [ ] **Step 2: 验证完整本地质量门。**

Run:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm test:db
pnpm release:check
```

Expected: 全部通过；若某项失败，先按失败类型修复并从该命令重新执行，不能跳过。

- [ ] **Step 3: 执行生产前数据库清单。**

在 `docs/12_database_release_runbook.md` 增加本迁移文件、Supabase SQL Editor 执行顺序、执行后的列检查：

```sql
select training_goal, generation_rule_version
from public.programs
order by created_at desc
limit 5;
```

更新 MVP checklist，增加两个手工验收场景：4 天力量举计划与无三项数据的 3 天增肌计划。

- [ ] **Step 4: 提交发布文档。**

```bash
git add scripts/release-check.mjs docs/12_database_release_runbook.md docs/11_mvp_release_checklist.md
git commit -m "docs: add goal-driven release verification"
```

- [ ] **Step 5: 仅在用户要求发布后执行部署。**

Run:

```bash
git push origin main
pnpm dlx vercel deploy --prod --yes
$env:BASE_URL='https://strength-periodization-manager.vercel.app'; pnpm smoke
```

Expected: GitHub 推送成功、Vercel 生产部署成功、线上 health 与首页返回 200。数据库迁移必须先由授权账号在 Supabase 执行，再验收力量举计划持久化。

## 计划自检

- 规格覆盖：Task 1 覆盖路线和输入门槛；Task 2 覆盖专项规则和减量；Task 3 覆盖表单与说明；Task 4 覆盖持久化与旧计划兼容；Task 5 覆盖质量门和发布。
- 无占位符：所有任务包含明确文件、接口、测试命令和提交范围。
- 类型一致性：`TrainingGoal` 是唯一的路线类型；`powerlifting` 和 `hypertrophy` 与数据库约束、payload、表单值一致；规则版本固定为 `goal-driven-v1`。
