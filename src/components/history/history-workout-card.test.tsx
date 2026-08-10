/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { HistoryWorkoutCard, type HistoryWorkoutCardProps } from "./history-workout-card";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const log = {
  actual_reps: 5,
  actual_weight: 80,
  completed: true,
  id: "log-1",
  rpe: 8,
  set_index: 1,
  target_reps: 5,
  target_weight: 80,
  workout_exercise_id: "exercise-1"
};

const rendered: Array<{ container: HTMLDivElement; root: Root }> = [];

afterEach(() => {
  for (const { container, root } of rendered.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

function renderCard(overrides: Partial<HistoryWorkoutCardProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const props: HistoryWorkoutCardProps = {
    durationSeconds: 2700,
    exercises: [{
      id: "exercise-1",
      logs: [log],
      name: "卧推",
      targetReps: 5,
      targetSets: 1,
      targetWeight: 80
    }],
    initiallyExpanded: false,
    isRecovery: false,
    name: "推 A",
    onSave: vi.fn(async (input) => ({ durationSeconds: input.durationSeconds, logs: input.logs })),
    onValidate: (logs) => ({ ok: true, logs }),
    recommendations: [],
    review: {
      averageRpe: 8,
      completedSets: 1,
      completionRate: 1,
      headline: "这次执行质量不错。",
      plannedSets: 1,
      tone: "good",
      volume: 400
    },
    scheduledDate: "2026-07-30",
    workoutId: "workout-1",
    ...overrides
  };
  act(() => root.render(<HistoryWorkoutCard {...props} />));
  rendered.push({ container, root });
  return { container, props };
}

function clickButton(view: HTMLElement, label: string) {
  const button = Array.from(view.querySelectorAll("button")).find((item) => item.textContent?.includes(label));
  if (!button) throw new Error(`button not found: ${label}`);
  button.click();
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("is read-only by default and viewing details does not enter edit mode", () => {
  const { container: view, props } = renderCard();

  expect(view.textContent).toContain("45 分钟");
  expect(view.textContent).toContain("最佳组：80kg × 5");
  expect(view.querySelectorAll("input")).toHaveLength(0);
  expect(view.textContent).not.toContain("保存修改");

  act(() => clickButton(view, "查看详情"));
  expect(view.textContent).toContain("第 1 组");
  expect(view.querySelectorAll("input")).toHaveLength(0);

  act(() => clickButton(view, "修改记录"));
  expect(view.textContent).toContain("正在修改历史记录");
  expect(view.querySelector("input[aria-label='实际训练时长（分钟）']")).not.toBeNull();
  expect(view.querySelector("input[aria-label='第 1 组重量 kg']")).not.toBeNull();

  act(() => {
    setInputValue(view.querySelector("input[aria-label='第 1 组重量 kg']")!, "82.5");
    clickButton(view, "取消");
  });
  expect(view.querySelectorAll("input")).toHaveLength(0);
  expect(props.onSave).not.toHaveBeenCalled();
});

it("exits edit mode and announces success after an atomic save", async () => {
  const { container: view, props } = renderCard();
  act(() => clickButton(view, "修改记录"));
  act(() => setInputValue(view.querySelector("input[aria-label='实际训练时长（分钟）']")!, "50"));

  await act(async () => {
    clickButton(view, "保存修改");
    await Promise.resolve();
  });

  expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({
    durationSeconds: 3000,
    workoutId: "workout-1"
  }));
  expect(view.querySelectorAll("input")).toHaveLength(0);
  expect(view.textContent).toContain("历史训练已保存，Coach 建议已重新计算。");
});

it("keeps inputs and draft values after a failed save", async () => {
  const onSave = vi.fn(async () => {
    throw new Error("网络连接失败，请重试。");
  });
  const { container: view } = renderCard({ onSave });
  act(() => clickButton(view, "修改记录"));
  act(() => setInputValue(view.querySelector("input[aria-label='第 1 组重量 kg']")!, "82.5"));

  await act(async () => {
    clickButton(view, "保存修改");
    await Promise.resolve();
  });

  expect(view.querySelector<HTMLInputElement>("input[aria-label='第 1 组重量 kg']")?.value).toBe("82.5");
  expect(view.textContent).toContain("网络连接失败，请重试。");
  expect(view.textContent).toContain("正在修改历史记录");
});
