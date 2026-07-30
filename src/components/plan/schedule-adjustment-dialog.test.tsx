/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildResumePreview, getRecoveryLoadAdvice } from "@/domain/schedule-adjustment";
import { ScheduleAdjustmentDialog } from "./schedule-adjustment-dialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const pendingTraining = [
  { sequenceIndex: 3, name: "拉 A", scheduledDate: "2026-08-10" },
  { sequenceIndex: 4, name: "蹲 A", scheduledDate: "2026-08-11" },
  { sequenceIndex: 5, name: "推 B", scheduledDate: "2026-08-12" },
  { sequenceIndex: 6, name: "拉 B", scheduledDate: "2026-08-14" }
];

const continuePreview = buildResumePreview({
  route: "continue_current_cycle",
  pendingTraining,
  templateLength: 3,
  resumedOn: "2026-08-20"
});

const nextCyclePreview = buildResumePreview({
  route: "start_next_cycle",
  pendingTraining,
  templateLength: 3,
  resumedOn: "2026-08-20"
});

function renderDialog(props: Partial<Parameters<typeof ScheduleAdjustmentDialog>[0]> = {}) {
  const onSelectRoute = vi.fn();
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const onInjuryAcknowledgedChange = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() =>
    root?.render(
      <ScheduleAdjustmentDialog
        onCancel={onCancel}
        onConfirm={onConfirm}
        onInjuryAcknowledgedChange={onInjuryAcknowledgedChange}
        onSelectRoute={onSelectRoute}
        preview={continuePreview}
        selectedRoute={null}
        {...props}
      />
    )
  );

  return { onSelectRoute, onConfirm, onCancel, onInjuryAcknowledgedChange };
}

function findInputByLabel(labelText: string, type: "radio" | "checkbox") {
  const labels = Array.from(container?.querySelectorAll("label") ?? []);
  const label = labels.find((node) => node.textContent?.includes(labelText));
  return (label?.querySelector(`input[type="${type}"]`) ?? null) as HTMLInputElement | null;
}

function findButton(text: string) {
  return (
    Array.from(container?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes(text)
    ) ?? null
  );
}

describe("ScheduleAdjustmentDialog", () => {
  it("leaves both resume routes unselected and confirmation disabled initially", () => {
    renderDialog({ selectedRoute: null });

    expect(findInputByLabel("继续当前循环", "radio")?.checked).toBe(false);
    expect(findInputByLabel("从下个循环第一节开始", "radio")?.checked).toBe(false);
    expect(findButton("确认调整")?.disabled).toBe(true);
  });

  it("enables confirmation only after the user picks a route", () => {
    const { onSelectRoute } = renderDialog({ selectedRoute: null });

    act(() => findInputByLabel("从下个循环第一节开始", "radio")?.click());
    expect(onSelectRoute).toHaveBeenCalledWith("start_next_cycle");

    act(() =>
      root?.render(
        <ScheduleAdjustmentDialog
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          onSelectRoute={onSelectRoute}
          preview={nextCyclePreview}
          selectedRoute="start_next_cycle"
        />
      )
    );

    expect(findInputByLabel("从下个循环第一节开始", "radio")?.checked).toBe(true);
    expect(findButton("确认调整")?.disabled).toBe(false);
    expect(container?.textContent).toContain(nextCyclePreview.nextDirection);
  });

  it("requires the injury acknowledgement checkbox before allowing confirmation", () => {
    const { onInjuryAcknowledgedChange } = renderDialog({
      selectedRoute: "continue_current_cycle",
      requireInjuryAcknowledgement: true,
      injuryAcknowledged: false
    });

    const acknowledgement = findInputByLabel("我已适合恢复一般训练；本产品不提供医疗判断", "checkbox");
    expect(acknowledgement).not.toBeNull();
    expect(acknowledgement?.checked).toBe(false);
    expect(findButton("确认调整")?.disabled).toBe(true);

    act(() => acknowledgement?.click());
    expect(onInjuryAcknowledgedChange).toHaveBeenCalledWith(true);

    act(() =>
      root?.render(
        <ScheduleAdjustmentDialog
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          onInjuryAcknowledgedChange={onInjuryAcknowledgedChange}
          onSelectRoute={vi.fn()}
          preview={continuePreview}
          selectedRoute="continue_current_cycle"
          requireInjuryAcknowledgement
          injuryAcknowledged
        />
      )
    );
    expect(findButton("确认调整")?.disabled).toBe(false);
  });

  it("shows skipped workouts and recovery load advice in the preview", () => {
    renderDialog({
      preview: nextCyclePreview,
      selectedRoute: "start_next_cycle",
      recoveryAdvice: getRecoveryLoadAdvice(10)
    });

    for (const name of nextCyclePreview.skippedWorkoutNames) {
      expect(container?.textContent).toContain(name);
    }
    expect(container?.textContent).toContain("停训约一到两周");
    expect(container?.textContent).toContain("92.5%");
  });

  it("keeps the dialog state on failure and blocks actions while busy", () => {
    const { onConfirm } = renderDialog({
      selectedRoute: "continue_current_cycle",
      busy: true,
      errorMessage: "网络连接失败，请稍后重试。"
    });

    expect(container?.textContent).toContain("网络连接失败，请稍后重试。");
    const confirmButton = findButton("确认调整");
    expect(confirmButton?.disabled).toBe(true);
    act(() => confirmButton?.click());
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
