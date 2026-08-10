/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { writeClientCache } from "@/lib/client-cache";

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { getSession: () => new Promise(() => undefined) }
  })
}));

import { ProgressDashboard } from "./progress-dashboard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  window.localStorage.clear();
  vi.useRealTimers();
});

it("uses one selected range for metrics, weekly trends, e1RM, and insight", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-30T12:00:00+08:00"));
  writeProgressCache();
  const view = document.createElement("div");
  root = createRoot(view);
  act(() => root?.render(<ProgressDashboard />));
  await act(async () => { await Promise.resolve(); });

  expect(view.textContent).toContain("完成训练");
  expect(view.textContent).toContain("2 次");
  expect(view.textContent).not.toContain("99,999");
  expect(view.querySelector("button[aria-pressed='true']")?.textContent).toBe("8周");
  expect(view.textContent).toContain("2026-07-25");
  expect(view.textContent).toContain("2026-06-15");

  act(() => button(view, "4周").click());
  expect(view.textContent).toContain("1 次");
  expect(view.textContent).not.toContain("2026-06-15");
  expect(view.textContent).toContain("暂无上周基线");

  act(() => button(view, "12周").click());
  expect(view.textContent).toContain("3 次");
  expect(view.textContent).toContain("2026-05-20");
});

function button(view: HTMLElement, label: string) {
  const target = [...view.querySelectorAll("button")].find((item) => item.textContent === label);
  if (!target) throw new Error(`Missing ${label}`);
  return target;
}

function writeProgressCache() {
  const workouts = [
    ["recent", "2026-07-25"],
    ["middle", "2026-06-15"],
    ["older", "2026-05-20"],
    ["ancient", "2026-04-01"]
  ].map(([id, scheduled_date]) => ({ day_type: "training", id, name: "推 A", scheduled_date }));
  const workoutExercises = workouts.map((workout, index) => ({
    exercises: { is_main_lift: true, name: "杠铃卧推", slug: "barbell_bench_press" },
    id: `exercise-${index}`,
    target_sets: 1,
    workout_id: workout.id
  }));
  const weights = [100, 90, 80, 99999];
  const setLogs = workoutExercises.map((exercise, index) => ({
    actual_reps: 5,
    actual_weight: weights[index],
    completed: true,
    id: `log-${index}`,
    workout_exercise_id: exercise.id
  }));
  writeClientCache("strength-training-cache:progress", { setLogs, workoutExercises, workouts });
}
