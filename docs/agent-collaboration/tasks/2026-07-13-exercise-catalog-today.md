# CC 任务：Today 动作说明与受控配件替换

## 背景与目标

`codex/exercise-catalog-integration` 已完成动作库静态数据、校验、客户端/服务端读取、PWA 缓存、替换领域规则、Supabase RPC 和动作库页面。你只负责原实施计划 Task 6：把动作说明和受控配件替换接入 Today 训练执行界面。

目标是让用户在今日训练中查看当前动作的中文说明，并且只在训练尚未开始且动作属于兼容配件时，安全地替换当前训练或本周期后续同类训练。

## 基线与分支

- 基线分支：`codex/exercise-catalog-integration`
- 当前分支：`claude/exercise-catalog-today`
- Worktree：`C:\Users\yaokui\Documents\力量训练周期管理\.worktrees\claude-exercise-catalog-today`

开始前必须运行：

```powershell
git status --short --branch
git log -1 --oneline
```

如果当前分支不是 `claude/exercise-catalog-today`，或工作区不干净，停止并报告。

## 必须先阅读

- `CLAUDE.md`
- `docs/superpowers/specs/2026-07-11-exercise-catalog-integration-design.md` 的 Today Workout Integration、Replacement Transaction、Error Handling、Security And Privacy
- `docs/superpowers/plans/2026-07-11-exercise-catalog-integration.md` 的 Task 6
- `src/domain/exercise-substitution.ts`
- `src/components/exercises/exercise-detail-launcher.tsx`
- `src/components/today/today-workout.tsx`
- `src/lib/client-cache.ts`
- `src/lib/analytics.ts`

## 允许修改

- Modify: `src/components/today/today-workout.tsx`
- Create: `src/components/today/exercise-substitution-dialog.tsx`
- Create: `src/components/today/exercise-substitution-dialog-state.ts`
- Create: `src/components/today/exercise-substitution-dialog-state.test.ts`
- Modify: `src/lib/analytics.ts`
- Modify: `src/lib/client-cache.ts`
- Create: `src/lib/client-cache.test.ts`

只有当现有类型使上述文件无法编译时，才能提出额外文件需求；先停止并报告，未经批准不要修改。

## 禁止事项

- 不修改数据库迁移、`supabase/schema.sql` 或 RPC 定义。
- 不修改动作库生成/校验脚本、PWA service worker 或 `/exercises` 页面。
- 不修改 Agent API、历史、进度、PR、计划生成或训练方法论。
- 不改变 main/secondary lift 的替换规则。
- 不新增依赖、不升级锁文件。
- 不推送、不部署、不连接生产 Supabase、不读取 `.env*`。
- 不重写 `today-workout.tsx`；只做完成本任务所需的局部改动。

## 接口与行为

### Today 查询

Today 的 workout exercise 查询必须获得：

```text
catalog_external_id
training_direction
movement_pattern
substitution_enabled
```

Today 数据加载完成后，只查询已审核、可兼容的 Supabase exercise 行。不要预加载 1,324 条静态动作库；只有用户打开动作说明时，才通过现有 `ExerciseDetailLauncher` 懒加载详情。

### 动作说明

- 有 `catalog_external_id` 的力量动作显示 `动作说明`。
- `cardio_zone2` 使用现有本地审核指导，不映射到错误的目录动作。
- 动作库加载失败不能阻塞训练记录；说明入口显示现有可恢复错误状态。

### 替换资格

仅当现有 `isExerciseSubstitutionEligible` 判定通过时显示 `替换动作`。必须同时满足：

- workout 状态是 `scheduled` 或 `draft`。
- `order_index >= 3`。
- 当前 workout exercise 没有已完成 set。
- 当前 exercise 的 `substitution_enabled = true`。
- 至少一个目标 exercise 与当前动作 `training_direction` 和 `movement_pattern` 相同。

### 对话框状态

新增纯状态模块和测试，至少证明：

- 只暴露兼容候选。
- 默认 scope 是 `current_workout`。
- 取消会重置选择且不产生 RPC 请求。
- confirm 返回精确的 source、target 和 scope。
- saving 状态阻止重复确认。
- RPC 错误保留用户选择并允许重试。

界面提供：

- `仅本次训练`，值为 `current_workout`，默认。
- `本周期后续同类训练`，值为 `remaining_program`。
- 明确文案：`新动作重量将重置为 0kg`。

### RPC

确认后调用：

```ts
const { data, error } = await supabase.rpc("substitute_workout_exercise", {
  p_workout_exercise_id: source.id,
  p_target_exercise_id: target.id,
  p_scope: scope
});
```

成功后：

1. 清理训练客户端缓存。
2. 使用 `clearWorkoutDrafts(workoutIds: string[])` 只清理受影响训练的 `strength-training-draft:<workoutId>`。
3. 记录 `exercise_substituted` analytics，包含 source、target、scope、count。
4. 重新运行提取后的 Today loader，使 exercise 和预创建 set logs 与服务端一致。

失败时显示友好中文错误，保持当前状态和选择，不清理缓存、不记录成功 analytics。

## TDD 顺序

1. 先新增 `src/lib/client-cache.test.ts`，证明只删除传入 workout IDs 对应的草稿键，不影响其他 localStorage 键。
2. 先新增 `exercise-substitution-dialog-state.test.ts`，覆盖候选、默认 scope、取消、confirm、重复提交和错误保持。
3. 运行局部测试并确认因功能不存在而失败。
4. 实现最小 `clearWorkoutDrafts` 和对话框状态模块，使测试通过。
5. 接入 UI、查询、RPC、缓存、analytics 和 reload。
6. 运行完整验证。

不要删除断言、跳过测试或只依赖手工测试。

## 验收标准

1. 每个已映射力量动作可从 Today 打开动作说明，Zone 2 显示本地指导。
2. 静态动作目录不在 Today 初次加载时下载。
3. 主项、次主项、已开始/完成动作、不可替换动作不显示替换入口。
4. 候选只包含同方向、同 movement pattern、已审核且允许替换的动作。
5. 两个 scope 向 RPC 发送精确参数；默认仅本次训练。
6. 成功替换后相关草稿和缓存被清理，Today 重新加载，重量重置提示清晰。
7. RPC 失败不会改变本地训练状态，用户可以重试。
8. Today 在动作目录不可用时仍可记录和完成训练。
9. 窄屏操作按钮不溢出、不遮挡现有 sticky action bar。

## 验证命令

确保 pnpm 可用：

```powershell
$env:PATH = 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback;C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + $env:PATH
```

先验证红灯，再在实现后运行：

```powershell
pnpm vitest run src/domain/exercise-substitution.test.ts src/lib/client-cache.test.ts src/components/today/exercise-substitution-dialog-state.test.ts
pnpm test
pnpm typecheck
pnpm build
git diff --check
git status --short --branch
```

所有测试、类型检查、构建和 diff 检查必须退出 0。若因环境原因无法运行，明确报告，不得声称通过。

## Git 与交付

只提交允许范围中的文件：

```powershell
git add src/components/today/today-workout.tsx src/components/today/exercise-substitution-dialog.tsx src/components/today/exercise-substitution-dialog-state.ts src/components/today/exercise-substitution-dialog-state.test.ts src/lib/analytics.ts src/lib/client-cache.ts src/lib/client-cache.test.ts
git commit -m "feat: add workout guidance and accessory replacement"
```

不要推送。提交后按 `docs/agent-collaboration/cc-handoff-template.md` 返回交付摘要，并附完整提交哈希。
