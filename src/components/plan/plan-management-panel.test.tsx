/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { PlanSetupInput } from "@/domain/plan-setup";
import { PlanManagementPanel } from "./plan-management-panel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

it("owns management, profile, and pause disclosures while delegating write callbacks", async () => {
  const onPause = vi.fn().mockResolvedValue(true);
  const view = renderPanel(onPause);
  expect(view.textContent).not.toContain("日程调整");

  await act(async () => button(view, "计划管理").click());
  expect(view.textContent).toContain("日程调整");
  expect(view.textContent).toContain("不可训练日");

  await act(async () => button(view, "更新体重、饮食与恢复").click());
  expect(view.textContent).toContain("训练画像");

  await act(async () => button(view, "暂停计划").click());
  change(view.querySelector('select[aria-label="暂停原因"]') as HTMLSelectElement, "time_conflict");
  change(view.querySelector('input[aria-label="预计恢复日期（可选）"]') as HTMLInputElement, "2026-08-25");
  await act(async () => { button(view, "确认暂停").click(); await Promise.resolve(); });
  expect(onPause).toHaveBeenCalledWith("time_conflict", "2026-08-25");
  expect(view.textContent).not.toContain("确认暂停");
});

it("keeps all visible management buttons at least 44px tall, including disabled ones", async () => {
  const view = renderPanel(vi.fn().mockResolvedValue(false), true);
  const trigger = button(view, "计划管理");
  expect(trigger.className).toContain("h-11");

  // Re-render non-busy to inspect the disclosed controls, then assert the busy
  // state separately on UnavailableDateManager's dedicated regression test.
  act(() => root?.unmount());
  root = createRoot(view);
  act(() => root?.render(panel(vi.fn().mockResolvedValue(false), false)));
  await act(async () => button(view, "计划管理").click());
  for (const action of view.querySelectorAll("button")) {
    expect(action.className, action.textContent ?? "button").toContain("h-11");
  }
});

function renderPanel(onPause: ReturnType<typeof vi.fn>, busy = false) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(panel(onPause, busy)));
  return container;
}

function panel(onPause: ReturnType<typeof vi.fn>, busy: boolean) {
  return (
    <PlanManagementPanel
      busy={busy}
      onAdjust={vi.fn()}
      onRegenerate={vi.fn()}
      profile={{ errors: {}, isSaving: false, onChange: vi.fn(), onSave: vi.fn(), value: profileValue }}
      schedule={{
        available: true, busy, hasPendingScheduleRows: true,
        onAddUnavailableDate: vi.fn(), onExtraRest: vi.fn(), onPause,
        onRemoveUnavailableDate: vi.fn(), onResume: vi.fn(), paused: false,
        recoveryMessage: null, resumeDate: null,
        unavailableDates: [{ id: "blocked-1", date: "2026-08-26", note: "出差" }]
      }}
    />
  );
}

function button(view: HTMLElement, label: string) {
  return [...view.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.includes(label))!;
}

function change(control: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value);
  act(() => control.dispatchEvent(new Event("change", { bubbles: true })));
}

const profileValue: PlanSetupInput = {
  experienceLevel: "beginner", goal: "strength", injuryNotes: "", movementRestrictions: [], lifts: [], accessoryLifts: [],
  nutritionAdherence: "moderate", proteinTargetMet: false, recoveryStatus: "normal", currentBodyWeightKg: "70",
  targetBodyWeightKg: "", weightChangeLast14DaysKg: "", sessionDurationMinutes: 60, weekCount: 4
};
