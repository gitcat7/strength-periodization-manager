/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { TodayProgressHeader } from "./today-progress-header";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("shows progress, workout context, and elapsed time with progress semantics", () => {
  const view = document.createElement("div");
  const root = createRoot(view);
  act(() => root.render(<TodayProgressHeader completedSets={3} date="2026-07-30" elapsedLabel="已训练 42:18" focus="胸 / 肩 / 三头" intent="强度" note="主项优先" totalSets={16} workoutName="推 A" />));
  expect(view.textContent).toContain("3/16 组");
  expect(view.textContent).toContain("强度");
  expect(view.textContent).toContain("胸 / 肩 / 三头");
  expect(view.textContent).toContain("已训练 42:18");
  const progress = view.querySelector("[role='progressbar']");
  expect(progress?.getAttribute("aria-valuemin")).toBe("0");
  expect(progress?.getAttribute("aria-valuemax")).toBe("16");
  expect(progress?.getAttribute("aria-valuenow")).toBe("3");
  act(() => root.unmount());
});
