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

function renderOverview({ actionLabel = "继续今日计划", paused = false }: { actionLabel?: string; paused?: boolean } = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = () => act(() => root.render(
    <CurrentProgramOverview
      calendarWeekLabel="第 1–2 周"
      currentCycleLabel="循环 2"
      currentWeek={1}
      endDate="2026-08-23"
      name="推/拉/蹲 A-B 周期"
      nextWorkout={{ date: "2026-07-30", focus: "胸部、肩部", intent: "强度", name: "推 A", stateLabel: "下一节训练" }}
      nextWorkoutActionLabel={actionLabel}
      onPausedAction={vi.fn()}
      paused={paused}
      startDate="2026-07-27"
      totalWeeks={12}
    />
  ));
  render();
  rendered.push({ container, root });
  return container;
}

function buttonOrLink(view: HTMLElement, label: string) {
  return Array.from(view.querySelectorAll<HTMLElement>("button, a")).find((node) => node.textContent === label)!;
}

it("shows one state-aware primary training action without mixing in management controls", () => {
  const view = renderOverview();

  expect(view.querySelectorAll("a[href='/today']")).toHaveLength(1);
  expect(view.textContent).toContain("计划第 1/12 周");
  expect(view.textContent).toContain("日历执行第 1–2 周");
  expect(view.textContent).toContain("循环 2");
  expect(view.textContent).toContain("继续今日计划");
  expect(view.textContent).not.toContain("计划管理");
});

it("uses future and paused CTA labels without implying early execution", () => {
  const future = renderOverview({ actionLabel: "查看下一节训练" });
  expect(buttonOrLink(future, "查看下一节训练").className).toContain("h-11");

  const paused = renderOverview({ paused: true });
  expect(paused.querySelectorAll("a[href='/today']")).toHaveLength(0);
  expect(buttonOrLink(paused, "恢复计划").className).toContain("h-11");
});

it("uses a 44px minimum height for the primary trigger", () => {
  const view = renderOverview();

  expect(buttonOrLink(view, "继续今日计划").className).toContain("h-11");
});
