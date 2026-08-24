# 计划页 Coach 建议与计划内容紧凑视图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 在计划页为待处理 Coach 建议提供可确认的批量应用/忽略，并把 Coach 与计划列表改成默认紧凑、按需展开的移动优先界面。

**Architecture:** ProgramManager 继续作为建议 RPC、计划数据和缓存刷新的唯一编排层。新本地 UI 状态只控制折叠区域和确认面板；批量应用先使用既有预览 RPC，确认后按顺序使用既有应用 RPC。计划内容只改变渲染的训练日集合，不改变排程、处方、编辑器或缓存。

**Tech Stack:** Next.js 14、React、TypeScript、Tailwind CSS、Lucide、Vitest、Supabase Browser Client。

## Global Constraints

- 不新增 SQL migration、schema、RPC、依赖或环境变量。
- 不改变训练算法、处方规则、建议产生规则、单条建议 RPC 契约或缓存 key。
- 中文、kg、移动端优先；关键按钮至少 44px 高，按钮文字不换行。
- 批量应用和批量忽略均需确认；取消、展开与收起均不得写数据库。
- 批量应用遇到第一条失败即停止，展示安全中文错误，失败/未处理建议必须保留。
- 在隔离 worktree、基线 0d83df1c61e95a5dbaef1309a2bc7fa8b59e8cc9 实施；测试明确“验证通过”前禁止部署。

---

## File Structure

- Modify: src/components/plan/program-manager.tsx — Coach 紧凑区、批量确认/执行及计划内容展开状态。
- Modify: src/components/plan/program-manager.test.tsx — DOM、交互、RPC 与移动端 CSS 契约。
- Carry: docs/superpowers/specs/2026-08-24-plan-coach-compact-view-design.md — 已确认规格。

## Execution Record

- [x] Task 1–3：在提交 `ded13d9519d58521a22cca3f2b007e6d81182aa7` 中完成。RED：ProgramManager 组件测试新增 4 项失败（默认全量展示、无批量确认、计划全量展示）；GREEN：focused 9/9 通过。
- [x] Task 4：`pnpm test` 为 78 files passed、361 passed、2 skipped；`pnpm release:check` 的 typecheck、生产构建和本地 14 路由含 `/api/health` smoke 通过；`git diff --check` 通过。
- [x] 无 SQL migration、schema、RPC、依赖或环境变更；隔离 worktree 内仅读取既有忽略的本地环境配置以运行本地 health smoke，未写入或提交密钥。

### Task 1: Coach 紧凑区与批量操作的 RED 测试

**Files:**
- Modify: src/components/plan/program-manager.test.tsx

**Interfaces:**
- Consumes: ProgramManager 和 createSupabaseClient 测试工厂。
- Produces: 支持 recommendations、previewByRecommendationId、rpcCalls 的 mock，以及默认/展开/批量失败回归用例。

- [ ] **Step 1: 扩展 mock**

为工厂增加 pending 建议、RPC 预览和应用失败参数，并记录调用。

~~~
type RpcCall = { name: string; args: Record<string, unknown> };
const rpcCalls: RpcCall[] = [];

rpc: (name, args) => {
  rpcCalls.push({ name, args });
  if (name === "preview_recommendation_application") {
    return Promise.resolve({
      data: previewByRecommendationId[String(args.p_recommendation_id)] ?? { workouts: [] },
      error: null
    });
  }
  if (name === "apply_recommendation") {
    return Promise.resolve({
      data: null,
      error: args.p_recommendation_id === applyRecommendationErrorId ? { message: "apply failed" } : null
    });
  }
  return Promise.resolve({ data: null, error: null });
}
~~~

默认建议为深蹲 90→92.5kg 与腿举 80→82.5kg 两条 pending 项。

- [ ] **Step 2: 添加默认收起/展开 RED 用例**

初始 DOM 必须有 Fitness Coach 建议、待处理 2 条、一键应用、一键忽略、展开建议；但没有逐条应用重量输入。点击展开后 aria-expanded 为 true 且显示两条输入。把深蹲应用重量改为 91，收起再展开后仍是 91。

~~~
expect(view.textContent).toContain("待处理 2 条");
expect(view.querySelector("input[aria-label='深蹲应用重量 kg']")).toBeNull();
await act(async () => findButton(view, "展开建议")?.click());
expect(findButton(view, "收起建议")?.getAttribute("aria-expanded")).toBe("true");
~~~

- [ ] **Step 3: 添加批量操作 RED 用例**

点击一键应用后显示“确认应用 2 条建议”和两条影响训练日，且 apply_recommendation 调用数仍为 0。确认后断言按深蹲、腿举顺序调用应用 RPC。令腿举失败时，断言停止后续项、显示“批量应用在腿举处失败，请重试。”且仍显示未处理建议。对一键忽略测试取消时零 update 调用、确认时每个 id 都写 status: rejected。

- [ ] **Step 4: 运行 RED**

Run:

~~~powershell
pnpm vitest run src/components/plan/program-manager.test.tsx
~~~

Expected: FAIL，因为当前界面直接显示全部建议且没有批量确认状态。

- [ ] **Step 5: 提交 RED**

~~~powershell
git add src/components/plan/program-manager.test.tsx
git commit -m "test: cover compact plan coach actions"
~~~

### Task 2: 实现 Coach 紧凑视图与安全批量操作

**Files:**
- Modify: src/components/plan/program-manager.tsx
- Test: src/components/plan/program-manager.test.tsx

**Interfaces:**
- Consumes: RecommendationRow、recommendationWeights、preview_recommendation_application、apply_recommendation 与 log_recommendations 更新。
- Produces: coachExpanded、bulkRecommendationDialog、openBulkApplicationPreview、confirmBulkApplication、confirmBulkIgnore。

- [ ] **Step 1: 增加类型和状态**

从 Lucide 引入 ChevronDown、ChevronUp，并定义：

~~~
type BulkRecommendationPreview = {
  items: RecommendationImpactPreview[];
};

type BulkRecommendationDialog =
  | { kind: "apply"; preview: BulkRecommendationPreview }
  | { kind: "ignore"; recommendationIds: string[] }
  | null;

const [coachExpanded, setCoachExpanded] = useState(false);
const [bulkRecommendationDialog, setBulkRecommendationDialog] =
  useState<BulkRecommendationDialog>(null);
~~~

- [ ] **Step 2: 实现批量应用预览**

openBulkApplicationPreview 读取每条 pending 建议的用户输入重量；非有限正数时显示“请为每条建议填写有效的应用重量。”并返回。它只调用已有 preview_recommendation_application：

~~~
supabase.rpc("preview_recommendation_application", {
  p_recommendation_id: recommendation.id,
  p_sets: null,
  p_weight: weight
});
~~~

所有预览成功才设置 apply 确认面板；任何错误都恢复状态、显示“建议影响预览失败，请重试。”且不写数据库。

- [ ] **Step 3: 实现批量确认与失败恢复**

confirmBulkApplication 对 preview items 使用 for...of，逐条调用：

~~~
supabase.rpc("apply_recommendation", {
  p_recommendation_id: item.recommendation.id,
  p_sets: item.sets,
  p_weight: item.weight
});
~~~

每次成功保持当前 analytics 事件语义。第一条错误时立即停止，关闭确认面板，清训练缓存并重载 recommendations/workouts，显示“批量应用在该动作处失败，请重试。”；全部成功时同样刷新，显示“已应用 N 条建议。”。

新增无 UI 副作用的 markRecommendationRejected helper，复用单条 rejectRecommendation 的 table update。批量忽略先设置确认面板；确认后顺序调用 helper。任一失败时停止、刷新、保留失败项，显示“批量忽略失败，请重试。”。

- [ ] **Step 4: 渲染紧凑 Coach 区和确认面板**

标题显示待处理数量、两个批量按钮和下列可访问控制：

~~~
<button
  aria-controls="coach-pending-recommendations"
  aria-expanded={coachExpanded}
  className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink"
  onClick={() => setCoachExpanded((current) => !current)}
  type="button"
>
  {coachExpanded ? "收起建议" : "展开建议"}
</button>
~~~

逐条 article 包在常驻 DOM 的 grid 中，收起时为 grid-rows-[0fr] opacity-0，展开时为 grid-rows-[1fr] opacity-100；两种状态均有 transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none，内层为 min-h-0 overflow-hidden。追加内联确认面板；确认/取消按钮均为 h-11 whitespace-nowrap。单条预览/应用/忽略保持不变。

- [ ] **Step 5: 运行 GREEN**

~~~powershell
pnpm vitest run src/components/plan/program-manager.test.tsx
~~~

Expected: PASS，默认紧凑、展开保留输入、确认门禁和部分失败保留均通过。

- [ ] **Step 6: 提交 Coach 功能**

~~~powershell
git add src/components/plan/program-manager.tsx src/components/plan/program-manager.test.tsx
git commit -m "feat: compact plan coach recommendations"
~~~

### Task 3: 计划内容紧凑展示与完整展开

**Files:**
- Modify: src/components/plan/program-manager.tsx
- Test: src/components/plan/program-manager.test.tsx

**Interfaces:**
- Consumes: workouts、nextPlanWorkoutId、workoutExercisesByWorkoutId 和现有训练日卡片。
- Produces: planContentsExpanded 与 visiblePlanWorkouts；不修改加载数据。

- [ ] **Step 1: 添加计划内容 RED 用例**

提供三节训练：下一节蹲 A，后续推 B、拉 A。初始断言有“计划内容 · 共 3 节”、蹲 A、展开完整计划，但没有推 B/拉 A。点击后断言三节均出现；再次点击恢复紧凑。按钮必须有 h-11、whitespace-nowrap、aria-expanded；折叠容器必须有 motion-reduce:transition-none。

- [ ] **Step 2: 运行 RED**

~~~powershell
pnpm vitest run src/components/plan/program-manager.test.tsx
~~~

Expected: FAIL，因为当前 workouts.map 直接显示每一节。

- [ ] **Step 3: 实现状态和选择器**

~~~
const [planContentsExpanded, setPlanContentsExpanded] = useState(false);

const visiblePlanWorkouts = useMemo(() => {
  if (planContentsExpanded) return workouts;
  const nextWorkout = workouts.find((workout) => workout.id === nextPlanWorkoutId);
  return nextWorkout ? [nextWorkout] : workouts.slice(0, 1);
}, [nextPlanWorkoutId, planContentsExpanded, workouts]);
~~~

- [ ] **Step 4: 包装计划列表**

在计划 section 顶部渲染“计划内容 · 共 N 节”、紧凑副文案和带 aria-controls=full-plan-workouts 的 h-11 单行按钮。使用同样的高度/透明度过渡与减少动画样式；把 workouts.map 改为 visiblePlanWorkouts.map。首个可见卡继续使用 firstScheduleItemRef；动作、处方编辑器和锁定提示一律保持。

- [ ] **Step 5: 运行 GREEN**

~~~powershell
pnpm vitest run src/components/plan/program-manager.test.tsx
rg -n "coach-pending-recommendations|full-plan-workouts|whitespace-nowrap|motion-reduce:transition-none|h-11" src/components/plan/program-manager.tsx
~~~

Expected: 测试通过；Coach/计划两个控制区均具备 44px、高可读单行文字、可访问折叠状态和减少动画支持。

- [ ] **Step 6: 提交计划内容功能**

~~~powershell
git add src/components/plan/program-manager.tsx src/components/plan/program-manager.test.tsx
git commit -m "feat: collapse plan workout contents"
~~~

### Task 4: 完整验证与独立测试交接

**Files:**
- Modify: docs/superpowers/plans/2026-08-24-plan-coach-compact-view.md — 勾选真实完成项。
- Modify: docs/superpowers/specs/2026-08-24-plan-coach-compact-view-design.md — 仅在实现与规格存在差异时修正。

- [ ] **Step 1: 运行本地门禁**

~~~powershell
pnpm vitest run src/components/plan/program-manager.test.tsx
pnpm test
pnpm release:check
git diff --check
git status --short --branch
~~~

Expected: focused、全量、typecheck、生产构建和本地 14 路由含 /api/health smoke 均通过；不提交既有 .claude 或 Phase 2 未跟踪计划。

- [ ] **Step 2: 固定并推送**

~~~powershell
git add docs/superpowers/specs/2026-08-24-plan-coach-compact-view-design.md docs/superpowers/plans/2026-08-24-plan-coach-compact-view.md
git commit -m "docs: record compact plan coach delivery"
git push -u origin HEAD
git rev-parse HEAD
~~~

Expected: 远端与固定 SHA 相同。

- [ ] **Step 3: 通知测试任务，不部署**

向任务 019fac2b-9290-72f3-88d6-5b2344a8e949 发送固定 SHA、分支、无 SQL migration、变更文件、验收项（默认紧凑、展开保留输入、批量应用/忽略确认、部分失败、默认下一节/完整展开、44px/不换行/减少动画）和命令结果。明确：测试明确回复“验证通过”前不得部署。

- [ ] **Step 4: 通过后门禁**

只有测试任务明确回复“验证通过”后，向架构师任务报告固定 SHA 和无迁移的部署准备状态；等待架构师明确授权后才可部署。
