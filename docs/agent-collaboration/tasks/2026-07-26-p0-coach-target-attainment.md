# CC 任务：P0 Coach 仅在目标达成时建议加重

## 背景与目标

当前 Coach 将 `completed` 勾选等同于训练达标。用户即使把计划 `100kg × 5` 记录为 `50kg × 1`，只要勾选完成且 RPE 较低，也可能得到加重建议。这是训练安全与信任 P0。

目标：Coach 的加重资格必须基于每组实际重量、次数与计划目标的达成情况，不能仅依赖完成勾选。

## 基线与范围

- 基线：最新 `main`。
- 分支：`claude/p0-coach-target-attainment`。
- 允许修改：`src/domain/fitness-coach.ts`、`src/domain/fitness-coach.test.ts`；仅在类型传递必要时修改直接调用该领域函数的最小文件。
- 禁止修改：数据库、Agent API、计划批量更新、新手画像、历史页面与依赖版本。

## 行为

- 完成组只有在实际重量不低于计划重量且实际次数不低于计划次数时，才计入「目标达成组」。
- 加重建议要求有效完成组全部达标，并保留现有 RPE 与数据完整性保护。
- 实际重量或次数低于目标时，不得生成加重建议；应返回现有体系中最保守的维持/降重/无建议结果，测试需固定该结果。
- 0、缺失、未完成与无计划目标的组不得被误计为达标。

## TDD 与验收

先写失败测试，至少覆盖：

1. `100×5` 计划、`50×1` 实际且 completed 时不加重。
2. 重量达标但次数不足时不加重。
3. 重量和次数均达标、RPE 符合时仍按既有规则加重。
4. 未完成或无效数据不提高完成率。

运行：

```powershell
pnpm vitest run src/domain/fitness-coach.test.ts
pnpm test
pnpm typecheck
pnpm release:check
git diff --check
```

## Git 与交付

提交信息：`fix: require target attainment for coach progression`。禁止推送；按 `cc-handoff-template.md` 交付。
