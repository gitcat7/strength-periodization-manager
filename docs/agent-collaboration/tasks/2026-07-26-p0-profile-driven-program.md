# CC 任务：P0 让用户画像真实驱动计划处方

## 背景与目标

用户填写目标、经验和伤病说明，但生成器基本不使用这些输入，且计算的保守 training max 会在生成时被 estimated 1RM 覆盖。产品界面承诺的个性化没有兑现。

目标：目标、经验和保守训练上限必须以可观察、可测试的方式影响生成结果；伤病说明在不能自动规避时必须明确边界。

## 基线与范围

- 基线：已合并 Coach 修复后的 `main`。
- 分支：`claude/p0-profile-driven-program`。
- 允许修改：`src/domain/program.ts`、`src/domain/program.test.ts`、`src/components/plan/program-manager.tsx`，以及直接相关的类型与中文提示文案。
- 禁止修改：数据库迁移、完成训练 RPC、Agent API、历史/进度/PR 页面、依赖版本。

## 行为

- `goal`、experience 与有效 `training_max` 必须作为生成器明确输入；不得在生成过程重新以 estimated 1RM 覆盖 training max。
- 新手与中级至少在主项强度、总组数或进阶节奏上存在确定且测试覆盖的差异。
- 目标选项必须影响周期侧重；若某个目标尚不支持，UI 不得把它呈现为已实现的个性化承诺。
- `injury_notes` 不可被自动医学解释；生成前/结果中必须明确“不会自动医学规避，请遵医嘱并手动替换动作”的边界，且不能默默忽略该字段。
- 保持 kg、push/pull/squat A-B 与每训练日单一方向约束。

## TDD 与验收

先写失败测试，至少覆盖：

1. 相同 estimated 1RM 下，新手的工作重量不超过其 training max，且与中级不同。
2. 不同目标产生可观察的计划差异。
3. training max 不会在生成时被 estimated 1RM 覆盖。
4. 有伤病说明时展示明确边界提示，不宣称自动医疗适配。

运行：

```powershell
pnpm vitest run src/domain/program.test.ts
pnpm test
pnpm typecheck
pnpm release:check
git diff --check
```

## Git 与交付

提交信息：`fix: generate programs from training profile inputs`。禁止推送；按模板交付。
