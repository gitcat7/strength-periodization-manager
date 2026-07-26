# CC 任务：P0 建议应用必须保留 A/B 周期结构

## 背景与目标

计划页接受一次动作建议后，会把该动作所有未来训练统一改为同一绝对重量，抹平强度日、容量日与减量周差异；历史修正后旧建议仍可应用。该行为破坏周期化核心价值。

目标：建议只更新正确的周期上下文，且历史数据变化会使失效建议不可再应用。

## 基线与范围

- 基线：已合并 Coach 目标达成修复后的 `main`。
- 分支：`claude/p0-recommendation-periodization`。
- 允许修改：`src/components/plan/program-manager.tsx`、`src/components/history/training-history.tsx`，以及为提取纯计算逻辑而新增的同目录状态模块与测试。
- 禁止修改：计划生成算法、数据库 schema/migration、Agent API、Today 完成流程、依赖版本。

## 行为

- 接受建议不得将同一动作的全部未来训练强制设为同一绝对重量。
- 强度/容量/减量周的相对结构必须保留；具体策略必须在实现前固定为可测试规则（例如按计划重量比例施加建议的增量）。
- 建议的适用对象必须包含生成它时的计划/训练上下文；不同训练方向或不同周期周不得误命中。
- 编辑影响 Coach 输入的历史组记录后，相关未应用建议必须失效或重新计算，不能继续静默应用旧结论。
- UI 要说明建议影响范围；失败时不部分修改未来训练。

## TDD 与验收

先写失败测试，至少证明：

1. 应用强度日卧推建议不会把容量日与减量周改为同一重量。
2. 仅匹配的未来训练上下文被更新。
3. 历史修正后旧建议不能再应用。
4. 更新失败不产生部分成功状态。

运行：

```powershell
pnpm vitest run src/components/plan src/components/history
pnpm test
pnpm typecheck
pnpm release:check
git diff --check
```

## Git 与交付

提交信息：`fix: preserve periodization when applying recommendations`。禁止推送；按模板交付。
