/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PlanSetupForm, ProfileContextForm } from "./program-manager";

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
          weekCount: 12,
          trainingDaysPerWeek: 3
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
          trainingDaysPerWeek: 3
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
    expect(container.textContent).not.toContain("单次时长");
    expect(container.textContent).not.toContain("可训练日");
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
          weekCount: 4,
          trainingDaysPerWeek: 3
        }}
      />
    ));

    const weight = container.querySelector('input[aria-label="卧推重量 kg"]');
    expect(weight).toHaveProperty("value", "22.5");
    expect(weight?.className).toContain("text-right");
    expect(weight?.className).toContain("tabular-nums");
  });
});
