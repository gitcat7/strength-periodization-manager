# 生产分支能力对账矩阵

固定基线：

- 生产骨架：`7778ccdb52f8e0652949a31a95be2322aaed0226`（`codex/checkpoint-pre-p0`）
- 恢复来源：`a7561dbbecc5edda58e75bed9e6162c1231057ef`（`origin/codex/p0-remediation`）
- 集成分支：`codex/production-reconciliation`

本矩阵只覆盖批次 A。合并结果已经完成定向测试、全量 Vitest、类型检查、构建、14 路由 smoke 与两组可用 pgTAP。

## 必须保留的能力

| 能力 | checkpoint 证据 | p0-remediation 证据 | 合并后测试 / 数据库契约 | 状态 |
| --- | --- | --- | --- | --- |
| 邮箱 8 位 OTP | `src/components/auth/email-login-form.tsx`；`src/components/auth/email-login-form.test.tsx`；`scripts/email-otp-login-contract.test.mjs`；`/login` | 旧认证实现，仅作冲突来源 | OTP focused、登录内容 contract、14 路由 smoke | 通过 |
| 顺序优先排程 | `src/domain/sequence-calendar.ts`；`src/domain/schedule-rule.ts`；`supabase/migrations/20260730100000_sequence_calendar_scheduling.sql`；`supabase/tests/sequence_calendar_scheduling.test.sql` | 不包含该能力 | sequence/calendar domain、schema contract 通过；sequence pgTAP 20/20 | 通过 |
| 暂停 / 恢复与不可训练日期 | `src/domain/schedule-adjustment.ts`；计划页排程组件；sequence migration/schema | 不包含该能力 | schedule adjustment、reflow payload、计划组件通过；sequence pgTAP 20/20 | 通过 |
| 未来训练不提前执行 | `src/domain/next-workout.ts`；`src/components/today/today-workout.tsx`；首页 CTA tests | 较早的 Today/Home 行为 | next-workout、Today、Home focused | 通过 |
| 严格画像处方 | 较早生成器，不完整 | `src/domain/training-prescription.ts`、`program.ts`、`plan-setup.ts`；`20260726200000_profile_driven_goal_prescriptions.sql` | prescription/program/plan-setup tests；profile SQL contract | 通过 |
| 训练时长追踪 | 不完整 | `src/domain/workout-duration.ts`；时长 UI；`20260729233000_workout_duration_tracking.sql` | duration domain/UI tests；duration SQL contract | 通过 |
| 原子完成与 Coach 建议 | 客户端/较早 RPC 路径 | `completion-result.ts`、Today/Agent/History；`20260730010000_atomic_training_completion_and_recommendations.sql` | atomic closure SQL contract、Today/Coach/API tests | 通过 |
| 历史读改分离 | 较早历史页 | History card/editor；`20260730123000_history_read_edit_workflow.sql` | History focused、history SQL contract | 通过 |
| 计划页任务化体验 | 已有计划默认隐藏生成器的近期修复 | current-program overview、schedule outline、ProgramManager tests | Plan focused | 通过 |
| Today 聚焦体验 | 未来训练阻断、完成弹窗关闭、小数重量列宽 | progress header、exercise disclosure、rest timer、原子完成 | Today focused | 通过 |
| 首页信息层级 | 最新 CTA 区分未来 / 逾期训练 | 下一训练优先、摘要布局 | Home focused | 通过 |
| 进展页范围分析 | 较早进展页 | 4/8/12 周、统一过滤数据集、e1RM 明细 | Progress focused | 通过 |
| 设置页与全局移动端体验 | OTP 后设置行为 | 分组、折叠、确认弹窗、安全区/焦点/44px 契约 | Settings/global mobile contracts | 通过 |
| 完成确认弹窗可关闭 | `454586f`；Today tests | 聚焦 Today 的完成流程 | Today completion preview regression | 通过 |
| 桌面端小数重量完整显示 | `7cc9dde`；Today tests | 移动端 Today 布局 | `22.5` 输入/显示与桌面列宽 regression | 通过 |

## SQL 恢复与生产执行边界

批次 A 恢复下列已经发布过的历史迁移到仓库，不要求用户重复执行；合并时验证幂等契约和 schema baseline 一致：

- `20260726120000_complete_training_workout_atomically.sql`
- `20260726200000_profile_driven_goal_prescriptions.sql`
- `20260729000000_session_duration_30_minutes.sql`
- `20260729150000_add_structured_movement_restrictions.sql`
- `20260729233000_workout_duration_tracking.sql`
- `20260730010000_atomic_training_completion_and_recommendations.sql`
- `20260730123000_history_read_edit_workflow.sql`

checkpoint 独有的 sequence scheduling 和延迟唯一约束迁移已保留。上列 7 个旧 P0 SQL 文件只是恢复仓库历史，用户不需要重复执行。

本批新增 `20260810010000_reconcile_session_duration_choices.sql`，用于让数据库约束同时接受 P0 的 30 分钟预算与 checkpoint 已支持的 45/60/75/90/120/150/180 分钟档位。它是唯一新增的生产 SQL 人工门禁；本任务未部署、未在生产执行。

## 已知 P1（仅记录，本批不扩展范围）

| 风险 | 当前审计结论 | 批次 A 处理 |
| --- | --- | --- |
| 跨账号缓存 | 训练缓存存在切换账号短暂读取旧数据的风险 | 记录；恢复两边能力时不得恶化，后续批次专项修复 |
| 关键排程查询 fail-open | 暂停/恢复关键查询失败可能错误降级 | 记录；后续专项改为 fail-closed |
| Progress 最早 60 条 | 查询/排序组合可能取得最早而非最近 60 次 | 记录；后续修复为数据库降序取 60、客户端升序 |
| 非原子计划画像保存 | 计划设置、画像与能力锚点可能部分成功 | 记录；后续事务 RPC |
| 发布门禁未包含 Vitest | `release:check` 不能单独证明全量测试已跑 | 本批显式分别执行 `pnpm test` 与 `pnpm release:check`；后续收紧脚本 |

## 最终证据

- SQL contract focused：5 个文件、20 个测试通过。
- Domain focused：5 个文件、70 个测试通过。
- UI focused：33 个文件、149 个测试通过（包含 OTP contract 2 项）。
- Full Vitest：100 个测试文件、437 个测试通过；2 个依赖本地环境的 smoke 测试跳过。测试输出保留既有 React `act(...)` 警告。
- `pnpm release:check`：typecheck、Next.js 生产构建、14 路由本地 smoke 通过。首次运行因独立 worktree 未带被忽略的 `.env.local`，`/api/health` 按设计返回 500；仅复制既有本地环境文件（未读取、未提交）后重跑通过。
- pgTAP：Docker 与既有 `strength-periodization-manager` 本地 Supabase 栈启动后，从原项目根目录运行相同测试文件以使用正确的 Docker project network；`pnpm test:db` 为 20/20 PASS，`pnpm test:db:sequence` 为 20/20 PASS。新 worktree 目录名会让 Supabase CLI 寻找不存在的 `production-reconciliation` 网络，因此不把该次 0 子测试的网络失败计为测试结果。
- `git diff --check`：通过。
- 独立测试窗口：交接固定提交后通知；验证通过前禁止部署。
