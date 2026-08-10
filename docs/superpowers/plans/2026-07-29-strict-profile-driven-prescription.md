# 严格画像驱动处方 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让新建/重新生成的计划严格使用目标、经验、主项工作组、频率与恢复画像，并修复辅助动作被主项强度系数压低的问题。

**Architecture:** `plan-setup` 负责按训练经验校验工作组；新建纯领域处方模块负责主项、次主项、辅助动作的分层负荷。`ProgramManager` 只传递已验证画像、展示解释，不在组件中计算重量。

**Tech Stack:** Next.js 15、React 19、TypeScript、Vitest、Tailwind、Supabase。

## Global Constraints

- 工作组输入不是 1RM；不猜测或混用两种口径。
- `beginner` 为 0–6 个月，`novice` 为 6–18 个月，`intermediate` 为 18 个月以上。
- 新手可无主项记录；其余经验等级至少一条有效工作组。
- 辅助动作绝不套用主项强度系数；kg 和最小增量不回归。
- 历史与已生成计划不迁移；新规则只用于新建/重新生成。

---

### Task 1: 按经验分级校验主项工作组

**Files:**
- Modify: `src/domain/plan-setup.ts`
- Modify: `src/domain/plan-setup.test.ts`
- Modify: `src/components/plan/program-manager.tsx`
- Modify: `src/components/plan/program-manager.plan-setup.test.tsx`

**Interfaces:** `validatePlanSetup(input)` 在 `beginner + lifts: []` 时成功，在 `novice/intermediate + lifts: []` 时返回 `fieldErrors.lifts`。

- [ ] **Step 1: 写失败领域测试**

```ts
it("allows a beginner to generate without a working set", () => {
  expect(validatePlanSetup(baseInput({ experienceLevel: "beginner", lifts: [] }))).toMatchObject({
    ok: true,
    value: { experienceLevel: "beginner", lifts: [] }
  });
});

it("requires a working set after six months", () => {
  expect(validatePlanSetup(baseInput({ experienceLevel: "novice", lifts: [] }))).toEqual({
    ok: false,
    fieldErrors: { lifts: "训练满 6 个月需要至少填写一个稳定完成的主项工作组" }
  });
});
```

- [ ] **Step 2: 验证红灯**

Run: `pnpm test src/domain/plan-setup.test.ts`

Expected: 新手空工作组用例失败。

- [ ] **Step 3: 最小实现**

只在 `experienceLevel === "novice" || experienceLevel === "intermediate"` 且无有效工作组时写入该错误；新手的已验证值保留 `lifts: []`。

- [ ] **Step 4: 验证绿灯**

Run: `pnpm test src/domain/plan-setup.test.ts`

Expected: PASS。

- [ ] **Step 5: 写失败表单测试并实现文案**

为 `PlanSetupForm` 增加断言：新手显示“新手可跳过，首次训练后再补充实际工作组”，初级显示“训练满 6 个月需要至少填写一个稳定完成的主项工作组”。在主项输入说明旁按 `experienceLevel` 显示对应文案，输入框始终可见。

- [ ] **Step 6: 验证并提交**

Run: `pnpm test src/components/plan/program-manager.plan-setup.test.tsx`

Expected: PASS。

```powershell
git add src/domain/plan-setup.ts src/domain/plan-setup.test.ts src/components/plan/program-manager.tsx src/components/plan/program-manager.plan-setup.test.tsx
git commit -m "feat: allow beginner plans without lift records"
```

### Task 2: 分层处方领域模块

**Files:**
- Create: `src/domain/training-prescription.ts`
- Create: `src/domain/training-prescription.test.ts`
- Modify: `src/domain/program.ts`
- Modify: `src/domain/program.test.ts`

**Interfaces:**

```ts
type PrescriptionRole = "primary" | "secondary" | "accessory" | "bodyweight";
resolvePrescriptionWeight({ role, profile, relatedProfile, targetReps, baseRatio, increment }): number;
getPrescriptionPolicy({ goal, experienceLevel, recoveryStatus, nutritionAdherence, proteinTargetMet, targetWeightChangeKgPerWeek, weightChangeLast14DaysKg }): Policy;
```

- [ ] **Step 1: 写失败的负荷隔离测试**

新建 `training-prescription.test.ts`，断言主项可由能力锚点计算、侧平举等辅助动作直接使用自己的 `workingWeight`、自重返回 `0`：

```ts
expect(resolvePrescriptionWeight({ role: "accessory", profile: { workingWeight: 8 }, targetReps: 15, baseRatio: 1, increment: 1 })).toBe(8);
expect(resolvePrescriptionWeight({ role: "bodyweight", profile: null, targetReps: 8, baseRatio: 1, increment: 2.5 })).toBe(0);
```

- [ ] **Step 2: 验证红灯**

Run: `pnpm test src/domain/training-prescription.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 最小实现分层负荷**

`primary` 用工作组 e1RM 反推目标次数重量，并以 90% 训练最大值作上限；`secondary` 用关联主项 e1RM × 动作专属比例后反推；`accessory` 使用自身锚点并按自身增量舍入；`bodyweight` 为 0。策略对象为五个目标提供主项/次主项/辅助次数和组数，恢复低或减脂能量风险只能降低/维持容量。

- [ ] **Step 4: 验证绿灯**

Run: `pnpm test src/domain/training-prescription.test.ts`

Expected: PASS。

- [ ] **Step 5: 写失败的计划生成回归测试**

在 `program.test.ts` 添加：中级增肌在相同频率下总组数高于新手增肌；更强卧推不改变独立侧平举锚点；高恢复/能量压力不增加组数。

- [ ] **Step 6: 接入模板角色**

给模板动作定义 `role`、`relatedMainLift`、`baseRatio`：卧推/深蹲/硬拉/推举为 `primary`；上斜哑铃卧推、罗马尼亚硬拉、腿举、杠铃划船为 `secondary`；侧平举、下压、弯举、面拉、腿弯举、小腿为 `accessory`；引体和有氧为 `bodyweight`。让 `buildFourWeekProgram` 使用处方模块，四周块第 4 周减量，长计划重复该块。

- [ ] **Step 7: 验证并提交**

Run: `pnpm test src/domain/training-prescription.test.ts src/domain/program.test.ts`

Expected: PASS。

```powershell
git add src/domain/training-prescription.ts src/domain/training-prescription.test.ts src/domain/program.ts src/domain/program.test.ts
git commit -m "feat: personalize prescriptions by training profile"
```

### Task 3: 无锚点新手计划与生成依据说明

**Files:**
- Modify: `src/domain/program.ts`
- Modify: `src/domain/program.test.ts`
- Modify: `src/components/plan/program-manager.tsx`
- Modify: `src/components/plan/program-manager.test.tsx`

**Interfaces:** 无主项锚点的新手计划输出 `targetWeight: 0` 的技术起始处方；页面显示实际使用的画像输入。

- [ ] **Step 1: 写失败新手计划测试**

```ts
it("creates a conservative beginner plan without inventing weights", () => {
  const workouts = buildFourWeekProgram({
    templateType: "three_split",
    schedule: { mode: "fixed_weekdays", weekdays: [1, 3, 5] },
    exerciseProfiles: [], experienceLevel: "beginner", goal: "hypertrophy"
  });
  const workout = workouts.find((item) => item.dayType === "training");
  expect(workout?.exercises[0]).toMatchObject({ targetWeight: 0 });
  expect(workout?.exercises[0]?.targetSets).toBeLessThanOrEqual(3);
});
```

- [ ] **Step 2: 验证红灯并实现**

Run: `pnpm test src/domain/program.test.ts`

Expected: FAIL。

当主项/次主项找不到锚点且用户是新手时，输出 0kg 和技术起始组数/次数；展示层将 0kg 解释为“从空杆或最轻可控重量开始”，不写入虚构重量。

- [ ] **Step 3: 写失败页面说明测试并实现**

在 `program-manager.test.tsx` 的有计划模拟中断言“本计划参考”“训练经验”“每周训练天数”。在计划参数区域增加紧凑说明卡：目标、经验、训练天数、主项工作组状态、恢复状态；只有体重/饮食触发容量保护时才显示原因。

- [ ] **Step 4: 验证并提交**

Run: `pnpm test src/domain/program.test.ts src/components/plan/program-manager.test.tsx`

Expected: PASS。

```powershell
git add src/domain/program.ts src/domain/program.test.ts src/components/plan/program-manager.tsx src/components/plan/program-manager.test.tsx
git commit -m "feat: explain plan inputs for new and experienced users"
```

### Task 4: 完整回归与发布

**Files:** Verify only: 所有上述改动文件。

- [ ] **Step 1: 全量测试**

Run: `pnpm test`

Expected: 所有现有测试通过；不新增跳过。

- [ ] **Step 2: 发布门禁**

Run: `pnpm release:check`

Expected: typecheck、production build 和本地 smoke 通过。

- [ ] **Step 3: 差异检查与发布**

Run: `git diff --check; git status --short --branch`

Expected: 无空白错误、无 `.env*` 或密钥变更。

按本项目既有授权执行：

```powershell
git push origin codex/p0-remediation
pnpm dlx vercel deploy --prod --yes
$env:BASE_URL='https://strength-periodization-manager.vercel.app'
Remove-Item Env:SMOKE_TRANSPORT -ErrorAction SilentlyContinue
pnpm smoke
```

Expected: 正式域名线上 smoke 通过。
