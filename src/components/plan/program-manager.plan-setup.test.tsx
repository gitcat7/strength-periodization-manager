/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { getPlanExerciseExplanation, PlanGenerationRationale, PlanSetupForm, ProfileContextForm } from "./program-manager";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("PlanSetupForm", () => {
  it("explains technical-start and calibrated-weight prescriptions without medical inference", () => {
    const value = { experienceLevel: "beginner" as const, goal: "strength" as const, injuryNotes: "肩部备注", lifts: [], weekCount: 4, sessionDurationMinutes: 30 as const };
    expect(getPlanExerciseExplanation({ exerciseSlug: "bench_press", targetSets: 2, targetReps: 5, targetWeight: 0, value }))
      .toContain("技术起始");
    expect(getPlanExerciseExplanation({ exerciseSlug: "lateral_raise", targetSets: 3, targetReps: 15, targetWeight: 8, value }))
      .toContain("保守估算待校准");
    expect(getPlanExerciseExplanation({ exerciseSlug: "lateral_raise", targetSets: 3, targetReps: 15, targetWeight: 8, isAccessoryCalibrated: true, value }))
      .toContain("辅助动作已校准");
  });
  it("offers existing-plan users a profile-only save action", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(
      <ProfileContextForm
        errors={{}}
        isSaving={false}
        onChange={() => undefined}
        onSave={() => undefined}
        value={{
          experienceLevel: "novice",
          goal: "fat_loss",
          injuryNotes: "",
          lifts: [],
          currentBodyWeightKg: "70",
          targetBodyWeightKg: "65",
          weekCount: 12
        }}
      />
    ));

    expect(container.textContent).toContain("更新体重、饮食与恢复");
    expect(container.querySelector('input[aria-label="当前体重 kg"]')).toHaveProperty("value", "70");
    expect(container.querySelector('input[aria-label="目标体重 kg"]')).toHaveProperty("value", "65");
    expect(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("保存画像数据"))).toBeTruthy();
  });

  it("shows the first-plan setup and retains a working-set input", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(
      <PlanSetupForm
        errors={{ lifts: "至少录入一个主项最近工作组" }}
        mainLifts={[{ id: "bench", slug: "bench_press", name: "卧推", default_increment: 2.5 }]}
        onChange={() => undefined}
        value={{
          experienceLevel: "beginner",
          goal: "strength",
          injuryNotes: "",
          lifts: [{ exerciseId: "bench", weightKg: "80", reps: "5" }],
          weekCount: 4,
          sessionDurationMinutes: 60
        }}
      />
    ));

    expect(container.textContent).toContain("训练安排与主项最近工作组");
    expect(container.querySelector('input[aria-label="卧推重量 kg"]')).toHaveProperty("value", "80");
    expect(container.textContent).toContain("至少录入一个主项最近工作组");
    expect(container.textContent).toContain("增肌（Hypertrophy）");
    expect(container.textContent).toContain("力型兼备（Hypertrophy + Strength）");
    expect(container.textContent).toContain("体重、饮食与恢复");
    expect(container.querySelector('input[aria-label="当前体重 kg"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="目标体重 kg"]')).not.toBeNull();
    expect(container.textContent).toContain("系统会按 4 周自动换算每周体重变化");
    expect(container.querySelector('select[aria-label="恢复状态"]')).not.toBeNull();
    expect(container.textContent).toContain("计划周期");
    expect(container.querySelector('select[aria-label="计划周期"]')).toHaveProperty("value", "4");
    expect(container.querySelectorAll('select[aria-label="计划周期"] option')).toHaveLength(12);
    expect(container.textContent).toContain("单次训练时长");
    expect(container.querySelector('select[aria-label="单次训练时长"]')).toHaveProperty("value", "60");
    expect(container.textContent).not.toContain("每周训练天数");
    expect(container.textContent).not.toContain("可训练日");
  });

  it("explains when a main-lift working set is optional or required", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(
      <PlanSetupForm
        errors={{}}
        mainLifts={[]}
        onChange={() => undefined}
        value={{
          experienceLevel: "beginner",
          goal: "hypertrophy",
          injuryNotes: "",
          lifts: [],
          weekCount: 4
        }}
      />
    ));

    expect(container.textContent).toContain("新手可跳过，首次训练后再补充实际工作组");

    act(() => root?.render(
      <PlanSetupForm
        errors={{}}
        mainLifts={[]}
        onChange={() => undefined}
        value={{
          experienceLevel: "novice",
          goal: "hypertrophy",
          injuryNotes: "",
          lifts: [],
          weekCount: 4
        }}
      />
    ));

    expect(container.textContent).toContain("训练满 6 个月需要至少填写一个稳定完成的主项工作组");
  });

  it("keeps decimal working weights readable in the compact mobile row", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(
      <PlanSetupForm
        errors={{}}
        mainLifts={[{ id: "bench", slug: "bench_press", name: "卧推", default_increment: 2.5 }]}
        onChange={() => undefined}
        value={{
          experienceLevel: "beginner",
          goal: "strength",
          injuryNotes: "",
          lifts: [{ exerciseId: "bench", weightKg: "22.5", reps: "5" }],
          weekCount: 4
        }}
      />
    ));

    const weight = container.querySelector('input[aria-label="卧推重量 kg"]');
    expect(weight).toHaveProperty("value", "22.5");
    expect(weight?.className).toContain("text-right");
    expect(weight?.className).toContain("tabular-nums");
  });

  it("lists the inputs used to generate a plan", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(
      <PlanGenerationRationale
        schedule={{ mode: "fixed_weekdays", weekdays: [1, 3, 5] }}
        value={{
          experienceLevel: "novice",
          goal: "hypertrophy",
          injuryNotes: "",
          lifts: [{ exerciseId: "bench", weightKg: "80", reps: "5" }],
          nutritionAdherence: "high",
          proteinTargetMet: true,
          recoveryStatus: "low",
          weekCount: 4
        }}
      />
    ));

    expect(container.textContent).toContain("本计划参考");
    expect(container.textContent).toContain("主要目标：增肌");
    expect(container.textContent).toContain("训练经验：初级，6-18 个月");
    expect(container.textContent).toContain("训练频率：固定每周 3 天");
    expect(container.textContent).toContain("主项工作组：已录入 1 项");
    expect(container.textContent).toContain("恢复状态：偏低");
  });
});
