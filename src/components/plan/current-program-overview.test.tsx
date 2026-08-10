/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { CurrentProgramOverview } from "./current-program-overview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rendered: Array<{ container: HTMLDivElement; root: Root }> = [];

afterEach(() => {
  for (const { container, root } of rendered.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

function renderOverview() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let managementOpen = false;

  const render = () => act(() => root.render(
    <CurrentProgramOverview
      currentCycleLabel="循环 2"
      currentWeek={1}
      endDate="2026-08-23"
      isBusy={false}
      managementOpen={managementOpen}
      name="推/拉/蹲 A-B 周期"
      nextWorkout={{ date: "2026-07-30", focus: "胸部、肩部", intent: "强度", name: "推 A", stateLabel: "下一节训练" }}
      onAdjustPlan={vi.fn()}
      onRegenerate={vi.fn()}
      onToggleManagement={() => { managementOpen = !managementOpen; render(); }}
      onToggleProfile={vi.fn()}
      profileOpen={false}
      startDate="2026-07-27"
    />
  ));
  render();
  rendered.push({ container, root });
  return container;
}

function buttonOrLink(view: HTMLElement, label: string) {
  return Array.from(view.querySelectorAll<HTMLElement>("button, a")).find((node) => node.textContent === label)!;
}

it("shows one primary training action and keeps management controls disclosed", () => {
  const view = renderOverview();

  expect(view.querySelectorAll("a[href='/today']")).toHaveLength(1);
  expect(view.textContent).toContain("第 1 周");
  expect(view.textContent).toContain("循环 2");
  expect(view.textContent).not.toContain("按当前参数重新生成");

  act(() => buttonOrLink(view, "计划管理").click());

  expect(view.textContent).toContain("调整计划");
  expect(view.textContent).toContain("按当前参数重新生成");
  expect(view.textContent).toContain("更新体重、饮食与恢复");
});

it("uses a 44px minimum height for primary and management triggers", () => {
  const view = renderOverview();

  expect(buttonOrLink(view, "继续训练").className).toContain("h-11");
  expect(buttonOrLink(view, "计划管理").className).toContain("h-11");
});
