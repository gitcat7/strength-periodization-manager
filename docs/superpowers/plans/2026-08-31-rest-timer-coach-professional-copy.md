# 自定义组间休息与 Coach 专业表达 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持 30–900 秒自定义组间休息，并在 Today 和 Plan 呈现专业、可解释的 Coach 信息。

**Architecture:** 使用前端纯函数校验秒数，继续通过 `strength-training-rest-timer` localStorage 保存有效默认值。Coach 保留所有既有规则和数据写入，只扩展领域展示数据并在两个页面消费。

**Tech Stack:** Next.js、React、TypeScript、Tailwind、Vitest、现有 Supabase 浏览器客户端。

## Global Constraints

- 不改 SQL、schema、RPC、建议算法、RPE/完成率/训练间隔阈值、缓存 key、依赖或处方。
- 只接受 30–900 秒整数；中文、kg、移动端 44px 触控目标与 reduced-motion 不回归。
- 只能解释已有数据，禁止医疗/营养诊断或补造缺失指标。
- 提交推送后先通知测试任务独立验收；仅在其明确“验证通过”且架构师授权后部署固定 SHA。

## Task 1: 自定义组间休息

**Files:**
- Create: `src/domain/rest-timer-settings.ts`
- Test: `src/domain/rest-timer-settings.test.ts`
- Modify: `src/components/today/today-workout.tsx`
- Test: `src/components/today/today-workout.test.tsx`

**Produces:** `parseRestTimerSeconds(value: string): { seconds: number | null; error: string | null }`.

- [ ] 1. 写失败领域测试：`"45"`、`"900"` 返回有效秒数；`"29"`、`"901"` 返回“30–900”；`"60.5"` 返回“整数”；空值返回“请输入”。
- [ ] 2. 运行 `pnpm vitest run src/domain/rest-timer-settings.test.ts`，预期因模块不存在而 RED。
- [ ] 3. 新建 parser：空值报“请输入 30–900 秒的整数。”；非 `/^\d+$/` 报“休息时长必须是整数秒。”；范围外报“休息时长需在 30–900 秒之间。”；否则返回数值和 null error。
- [ ] 4. 重跑该命令，预期 GREEN。
- [ ] 5. 在 Today 测试先写失败场景：输入 `150` 并失焦后 localStorage 包含 `"seconds":150`、默认显示 `2:30`；输入 29/901/60.5/-30/空值不覆盖 150 且有中文错误；120 秒运行中改默认到 150 不改变剩余时间，点重置后才显示 `2:30`。
- [ ] 6. 运行 `pnpm vitest run src/components/today/today-workout.test.tsx src/domain/rest-timer-settings.test.ts`，预期 RED：没有自定义输入且 reader 拒绝 150。
- [ ] 7. 在 `RestTimerPanel` 添加有 `aria-label="自定义组间休息秒数"` 的 h-11 number input，属性为 `inputMode="numeric" min=30 max=900 step=1`；blur 和 Enter 仅在 parser 成功时调用 `onSecondsChange`。reader 改为接受 30–900 整数，旧无效设置仍回退 120。不得在改默认时调用 `setRestRemaining`。
- [ ] 8. 重跑 focused 命令，预期 GREEN；快捷档位、暂停、重置、跳过和保存现有行为不回归。
- [ ] 9. 提交：`git add src/domain/rest-timer-settings.ts src/domain/rest-timer-settings.test.ts src/components/today/today-workout.tsx src/components/today/today-workout.test.tsx`，提交信息 `feat: allow custom rest timer seconds`。

## Task 2: Coach 专业化展示

**Files:**
- Modify/Test: `src/domain/fitness-coach.ts`、`src/domain/fitness-coach.test.ts`
- Modify/Test: `src/components/today/today-workout.tsx`、`src/components/today/today-workout-coach.test.tsx`
- Modify/Test: `src/components/plan/program-manager.tsx`、`src/components/plan/program-manager.test.tsx`

**Produces:** 扩展 `getInterruptionAdvice()` 的 `basis`、`action` 字段；新增 `getRecommendationPresentation({ type, previousWeight, suggestedWeight, reason, workoutName, scheduledDate })`，返回 `direction`、`basis`、`impact`。

- [ ] 1. 写失败领域测试：训练间隔 1 天必须输出 `title === "可按计划推进"`、basis 含“训练间隔 1 天”、action 含“RPE 7–8”、loadMultiplier 仍为 1；90→92.5kg 的 `increase_weight` 推荐必须展示“小幅加重”、保留原 reason，并引用后续日期。
- [ ] 2. 运行 `pnpm vitest run src/domain/fitness-coach.test.ts`，预期因字段/helper 缺失和旧标题“正常推进”而 RED。
- [ ] 3. 在每个既有训练间隔分支保留 days 条件与 loadMultiplier，仅添加专业的 title/basis/action，message 由 basis/action 组合以兼容旧调用。将 `increase_weight`/`increase` 映射为“小幅加重”，`decrease_weight`/`decrease` 映射为“建议下调负荷”，`deload` 映射为“建议恢复或减量”，其余映射为“维持当前处方”。basis 必须原样保留 reason；无训练日信息时 impact 固定为“应用后仅影响后续未完成训练日”。
- [ ] 4. 重跑领域测试，预期 GREEN，且已有科学规则安全测试全部通过。
- [ ] 5. 写 Today 失败测试，要求 DOM 有“训练状态：可按计划推进”“判断依据：训练间隔 1 天”“执行建议：主项以 RPE 7–8”。写 Plan 失败测试，要求 pending 建议有“调整方向：小幅加重”“判断依据：动作完成稳定。”“影响范围：2026-08-24 · 蹲 A”，并仍可找到“一键应用”“一键忽略”。
- [ ] 6. 运行 `pnpm vitest run src/components/today/today-workout-coach.test.tsx src/components/plan/program-manager.test.tsx`，预期标签缺失而 RED。
- [ ] 7. Today 使用扩展 advice 渲染三层标签，保留方向专项 cue。Plan 导入 presentation helper，在既有重量输入、预览/应用/忽略按钮前渲染方向、依据、影响范围；不得修改 RPC 名称/参数、recommendationWeights、预览确认、批量顺序或 analytics。
- [ ] 8. 重跑 focused 组件命令并验证 GREEN；中文文本使用 `text-sm leading-6 min-w-0` 与正常换行，不能使用窄固定列。
- [ ] 9. 提交：`git add src/domain/fitness-coach.ts src/domain/fitness-coach.test.ts src/components/today/today-workout.tsx src/components/today/today-workout-coach.test.tsx src/components/plan/program-manager.tsx src/components/plan/program-manager.test.tsx`，提交信息 `feat: professionalize coach guidance copy`。

## Task 3: 验证、测试与发布门禁

**Files:** Modify `docs/superpowers/plans/2026-08-31-rest-timer-coach-professional-copy.md` with real RED/GREEN evidence.

- [ ] 1. 运行 focused：`pnpm vitest run src/domain/rest-timer-settings.test.ts src/domain/fitness-coach.test.ts src/components/today/today-workout.test.tsx src/components/today/today-workout-coach.test.tsx src/components/plan/program-manager.test.tsx`。
- [ ] 2. 运行 `pnpm test`、`pnpm release:check`、`git diff --check`；记录真实退出码和通过数量。
- [ ] 3. 提交执行记录：`git add docs/superpowers/plans/2026-08-31-rest-timer-coach-professional-copy.md`，提交信息 `docs: record rest timer coach delivery`；执行 `git push -u origin codex/rest-timer-coach-copy` 并记录 `git rev-parse HEAD`。
- [ ] 4. 使用 `codex_app__send_message_to_thread` 通知测试任务 `019fac2b-9290-72f3-88d6-5b2344a8e949`（host `local`），包含固定 SHA、无 SQL 声明、变更文件、测试命令、30–900 边界、运行中计时器不跳变和 Coach 不改算法验收点。
- [ ] 5. 在测试任务明确“验证通过”后，通知架构师任务 `019f9d55-a57d-7860-8d3d-210bafc8c3e3` 请求范围/部署授权。仅从被授权 SHA 的干净 detached worktree 部署；随后用 `BASE_URL=https://strength-periodization-manager.vercel.app pnpm smoke` 和无缓存 `/api/health` 验证，并回报部署 ID、URL 与结果给架构师。

## Execution record — 2026-08-31

- RED → GREEN（自定义休息）：`src/domain/rest-timer-settings.test.ts` 初次执行因模块不存在失败；实现 parser 后为 2/2 通过。`today-workout` focused 在加入 UI 用例后先因没有自定义输入失败，完成输入、localStorage reader 与运行中倒计时保持不变的实现后通过。
- RED → GREEN（Coach）：领域测试先确认旧 `正常推进` 标题和缺少 presentation helper 为失败；Plan 组件测试先确认缺少“调整方向”标签为失败；Today Coach DOM 测试也在旧单段文案渲染下失败。补齐专业展示字段与两个页面标签后均通过。
- Focused：`pnpm vitest run src/domain/rest-timer-settings.test.ts src/domain/fitness-coach.test.ts src/components/today/today-workout.test.tsx src/components/today/today-workout-coach.test.tsx src/components/plan/program-manager.test.tsx` — exit 0，5 files / 39 tests passed。（ProgramManager 输出一条既有 React act 警告。）
- Full suite：`pnpm test` — exit 0，79 files passed / 2 skipped，370 passed / 2 skipped。
- Release：`pnpm release:check` — exit 0，typecheck、production build 与 14 路由（含 `/api/health`）local smoke 均通过。隔离工作树初次缺少本地公开 Supabase 环境变量；仅复制现有、忽略的 `.env.local` 用于本地验证，未纳入 Git。
- `git diff --check` — exit 0。无 SQL migration、schema、RPC、算法、缓存 key、依赖或环境提交变更。
