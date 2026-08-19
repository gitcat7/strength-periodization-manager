/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CoachRecommendationInbox, type CoachRecommendation } from "./coach-recommendation-inbox";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

it("deduplicates source workout actions and prioritizes recovery before loading", () => {
  const recommendations = [
    recommendation("increase", "increase", "加重"),
    recommendation("hold", "hold", "保持"),
    recommendation("decrease", "decrease", "降重"),
    recommendation("deload", "deload", "减量"),
    { ...recommendation("duplicate", "increase", "重复"), workout_id: "deload-workout", exercise_id: "deload-exercise" }
  ];
  const view = render(recommendations);

  expect(view.querySelectorAll("article")).toHaveLength(3);
  expect(view.textContent).toContain("减量");
  expect(view.textContent).toContain("降重");
  expect(view.textContent).toContain("保持");
  expect(view.textContent).not.toContain("重复");
  expect(view.textContent).toContain("还有 1 条建议");
});

it("previews the exact impact before applying and keeps actions touch sized", async () => {
  const accept = vi.fn();
  const view = render([recommendation("deload", "deload", "减量")], accept);
  const preview = button(view, "预览应用");
  expect(preview.className).toContain("h-11");

  await act(async () => preview.click());
  expect(view.querySelector('[role="dialog"]')?.textContent).toContain("将影响 2 个后续训练日");
  const confirm = button(view, "确认应用");
  await act(async () => { confirm.click(); await Promise.resolve(); });
  expect(accept).toHaveBeenCalledTimes(1);
});

function render(recommendations: CoachRecommendation[], onAccept = vi.fn()) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(
    <CoachRecommendationInbox
      busy={false}
      getImpact={() => ({ count: 2, dates: ["2026-08-21", "2026-08-23"] })}
      onAccept={onAccept}
      onReject={vi.fn()}
      onWeightChange={vi.fn()}
      recommendations={recommendations}
      weights={{}}
    />
  ));
  return container;
}

function recommendation(id: string, type: CoachRecommendation["recommendation_type"], name: string): CoachRecommendation {
  return {
    exercise_id: `${id}-exercise`, exercises: { name, slug: id }, id,
    previous_weight: 60, reason: `${name}原因`, recommendation_type: type,
    suggested_weight: 62.5, workout_id: `${id}-workout`,
    workouts: { name: "训练日", scheduled_date: "2026-08-20", sequence_index: 1 }
  };
}

function button(view: HTMLElement, label: string) {
  return [...view.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === label)!;
}
