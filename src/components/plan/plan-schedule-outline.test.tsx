/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { groupPlanOutline } from "@/domain/plan-outline";
import { PlanScheduleOutline } from "./plan-schedule-outline";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const outline = groupPlanOutline([
  { id: "a", day_type: "training", name: "推 A", schedule_index: 0, sequence_index: 0, scheduled_date: "2026-07-01", status: "completed" },
  { id: "b", day_type: "training", name: "拉 B", schedule_index: 1, sequence_index: 1, scheduled_date: "2026-07-02", status: "scheduled" },
  { id: "c", day_type: "training", name: "推 A", schedule_index: 7, sequence_index: 2, scheduled_date: "2026-07-08", status: "scheduled" },
  { id: "d", day_type: "training", name: "拉 B", schedule_index: 8, sequence_index: 3, scheduled_date: "2026-07-09", status: "scheduled" },
  { id: "e", day_type: "training", name: "推 A", schedule_index: 9, sequence_index: 4, scheduled_date: "2026-07-10", status: "scheduled" }
], "2026-07-01");

const rendered: Array<{ container: HTMLDivElement; root: Root }> = [];

afterEach(() => {
  for (const { container, root } of rendered.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

function renderOutline({ defaultWeek = 2, defaultCycleIndex = 1, mode = "default" }: {
  defaultWeek?: number;
  defaultCycleIndex?: number | null;
  mode?: "all" | "collapsed" | "default";
} = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(
    <PlanScheduleOutline
      defaultCycleIndex={defaultCycleIndex}
      defaultWeek={defaultWeek}
      mode={mode}
      onModeChange={vi.fn()}
      outline={outline}
      renderWorkout={(workout) => <article key={workout.id}>{workout.name}</article>}
    />
  ));
  rendered.push({ container, root });
  return container;
}

it("opens only the selected week and selected structure cycle by default", () => {
  const view = renderOutline();
  const weeks = view.querySelectorAll<HTMLDetailsElement>("[data-plan-week]");

  expect(weeks[0].open).toBe(false);
  expect(weeks[1].open).toBe(true);
  const cycles = weeks[1].querySelectorAll<HTMLDetailsElement>("[data-plan-cycle]");
  expect(cycles[0].open).toBe(true);
  expect(cycles[1].open).toBe(false);
});

it("supports all and collapsed without changing the selected defaults", () => {
  const all = renderOutline({ mode: "all" });
  expect([...all.querySelectorAll<HTMLDetailsElement>("details")].every((node) => node.open)).toBe(true);
  const collapsed = renderOutline({ mode: "collapsed" });
  expect([...collapsed.querySelectorAll<HTMLDetailsElement>("details")].every((node) => !node.open)).toBe(true);
});
