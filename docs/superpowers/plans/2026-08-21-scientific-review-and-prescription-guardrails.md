# P0：科学复盘与计划日处方护栏实施计划

**基线：** `fac92d72e2fad0712234797a8dd6dda41738cdda`，工作分支 `claude/science-review-guardrails`。

## Task 1：规则领域与测试

文件：`src/domain/scientific-review.ts`、`src/domain/scientific-review.test.ts`、`src/domain/fitness-coach.ts`、对应测试。

1. 先写失败测试：数据不足保持；完成率/RPE/间隔/恢复警告压过加重；主项正常完成才按增量加重；辅助动作低 RPE 不加重；减量与延后提示。
2. 运行 `pnpm vitest run src/domain/scientific-review.test.ts src/domain/fitness-coach.test.ts`，确认 RED。
3. 实现纯函数 `buildScientificReview`，输出 `{ type, suggestedWeight, suggestedSets, reasonCode, reason }`；将现有 Coach 调用映射到该规则。
4. 重跑命令确认 GREEN，提交 `feat: add conservative scientific review rules`。

## Task 2：数据库原子完成与建议审计

文件：`supabase/migrations/20260821010000_scientific_review_and_prescription_guardrails.sql`、`supabase/schema.sql`、`supabase/tests/scientific_review_guardrails.test.sql`、`scripts/scientific-review-sql-contract.test.mjs`。

1. 先写 SQL contract/pgTAP RED，覆盖 migration 名称、source revision、partial pending 唯一约束、权限、原子 RPC 和 accepted/modified/rejected 保留。
2. 迁移增加 `coach_revision`、建议来源/规则字段及处方修订 audit；实现 complete/revise/preview/apply RPC 和安全 owner 检查。
3. 同步 schema，应用本地 migration，运行 contract 与 pgTAP；确认重复完成不重复建议、历史修改只替换 pending、RPC 回滚。
4. 提交 `feat: atomically persist scientific review recommendations`。

## Task 3：处方护栏和影响预览

文件：`src/domain/workout-prescription-guardrails.ts`、测试、`src/components/plan/workout-prescription-editor.tsx`、测试、`src/components/plan/program-manager.tsx`、测试。

1. 先写失败测试：状态/完成组/动作数/重复/方向/主项/数值阻断；训练量/重主项/恢复/经验 warning；未确认 warning 不保存；预览列出后续训练日。
2. 实现方向与处方护栏纯函数，动作分类只读取 metadata；选择性移植处方编辑器至生产基线，调用 RPC 而非多表写入。
3. GREEN 后提交 `feat: guard workout prescription edits with preview`。

## Task 4：Today、History 与计划建议界面接入

文件：`src/components/today/today-workout.tsx`、测试；`src/components/history/training-history.tsx`、测试；`src/components/plan/program-manager.tsx`、测试。

1. 先写失败测试：周期完成仅消费 complete RPC；自由训练不自动改处方；历史保存调用 revise RPC；接受/修改建议先预览再应用；拒绝只更新状态。
2. 将浏览器端组日志/状态/建议串行写入替换为 RPC 结果消费；显示说明与影响预览；刷新 Today/History/Progress/Coach 缓存。
3. GREEN 后提交 `feat: surface review suggestions and guarded plan edits`。

## Task 5：集成验证和交接

1. focused：科学规则、SQL contract、Today、History、Plan、Progress、Coach。
2. `pnpm test`、`pnpm release:check`、`git diff --check`；DB 可用时运行 migration 和 pgTAP。
3. 推送固定 SHA，通知测试任务独立验证；不部署。
4. 向架构师报告固定 SHA、唯一 SQL 文件和测试结果，等待迁移确认及独立测试通过。
