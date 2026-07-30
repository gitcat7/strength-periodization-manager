/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { writeClientCache } from "@/lib/client-cache";

const router = { replace: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      getSession: () => new Promise(() => {})
    }
  })
}));

import { TodayWorkout } from "./today-workout";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: () => ({
    addEventListener: () => undefined,
    matches: false,
    removeEventListener: () => undefined
  })
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.useRealTimers();
});

describe("TodayWorkout cache hydration", () => {
  it("keeps loading instead of rendering no-plan when a stale rest cache has a next training session", () => {
    vi.useFakeTimers();
    writeClientCache("strength-training-cache:today", {
      coachRecommendations: [],
      exercises: [],
      lastCompletedWorkout: null,
      nextTraining: {
        dayType: "training",
        id: "training-next",
        name: "推 A · 强度",
        scheduledDate: "2026-07-16",
        sequenceIndex: 3,
        status: "scheduled"
      },
      restItem: {
        dayType: "rest",
        id: "rest-yesterday",
        scheduledDate: "2026-07-15",
        status: "scheduled"
      },
      setLogs: {},
      userId: "user-1",
      workout: null
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(<TodayWorkout />));

    expect(container.textContent).toContain("正在读取今日训练");
    expect(container.textContent).not.toContain("还没有可执行的训练计划");
  });

  it("requires a real strength RPE before a set can be marked complete", async () => {
    writeCachedWorkout({ slug: "barbell_bench_press" });
    ({ container, root } = renderTodayWorkout());

    await act(async () => {
      await Promise.resolve();
    });

    const completion = container.querySelector<HTMLInputElement>('input[aria-label="第 1 组完成"]');
    expect(completion).not.toBeNull();

    act(() => completion?.click());

    expect(completion?.checked).toBe(false);
    expect(container.textContent).toContain("请先填写真实 RPE（1–10）后再完成该组。");
  });

  it("completes a strength set after the user records a valid RPE", async () => {
    writeCachedWorkout({ slug: "barbell_bench_press" });
    ({ container, root } = renderTodayWorkout());

    await act(async () => {
      await Promise.resolve();
    });

    const numberInputs = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
    act(() => setInputValue(numberInputs[2]!, "8"));

    const completion = container.querySelector<HTMLInputElement>('input[aria-label="第 1 组完成"]');
    act(() => completion?.click());

    expect(completion?.checked).toBe(true);
  });

  it("fills planned strength values without fabricating RPE or completion", async () => {
    writeCachedWorkout({ slug: "barbell_bench_press" });
    ({ container, root } = renderTodayWorkout());

    await act(async () => {
      await Promise.resolve();
    });

    const fillButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "按计划填入");
    act(() => fillButton?.click());

    const completion = container.querySelector<HTMLInputElement>('input[aria-label="第 1 组完成"]');
    const numberInputs = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
    expect(completion?.checked).toBe(false);
    expect(numberInputs[2]?.value).toBe("");
  });

  it("keeps the no-RPE completion exception for cardio", async () => {
    writeCachedWorkout({ slug: "cardio_zone2", targetWeight: 0 });
    ({ container, root } = renderTodayWorkout());

    await act(async () => {
      await Promise.resolve();
    });

    const completion = container.querySelector<HTMLInputElement>('input[aria-label="第 1 组完成"]');
    act(() => completion?.click());

    expect(completion?.checked).toBe(true);
  });

  it("focuses the first incomplete exercise, advances focus, and preserves manual reopening", async () => {
    writeCachedWorkout({ slug: "barbell_bench_press", twoExercises: true });
    ({ container, root } = renderTodayWorkout());
    await act(async () => { await Promise.resolve(); });

    const bench = getExercise(container, "杠铃卧推");
    const press = getExercise(container, "站姿推举");
    expect(bench.getAttribute("data-expanded")).toBe("true");
    expect(press.getAttribute("data-expanded")).toBe("false");

    const rpe = bench.querySelector<HTMLInputElement>('input[aria-label="RPE"]');
    act(() => setInputValue(rpe!, "8"));
    act(() => bench.querySelector<HTMLInputElement>('input[aria-label="第 1 组完成"]')?.click());

    expect(bench.getAttribute("data-expanded")).toBe("false");
    expect(press.getAttribute("data-expanded")).toBe("true");
    act(() => [...bench.querySelectorAll("button")].find((button) => button.textContent === "展开")?.click());
    expect(bench.getAttribute("data-expanded")).toBe("true");
  });

  it("shows one progressbar, a floating active rest timer, and one filled completion action", async () => {
    writeCachedWorkout({ slug: "barbell_bench_press", targetWeight: 22.5 });
    ({ container, root } = renderTodayWorkout());
    await act(async () => { await Promise.resolve(); });
    const view = container!;
    expect(view.querySelectorAll("[role='progressbar']")).toHaveLength(1);
    const weight = view.querySelector<HTMLInputElement>('input[aria-label="重量"]');
    expect(weight?.value).toBe("22.5");
    expect(weight?.className).toContain("min-w-0");
    act(() => setInputValue(view.querySelector<HTMLInputElement>('input[aria-label="RPE"]')!, "8"));
    act(() => view.querySelector<HTMLInputElement>('input[aria-label="第 1 组完成"]')?.click());
    expect(view.querySelector("[data-rest-timer-floating]")).not.toBeNull();
    const primary = [...view.querySelectorAll("button")].filter((button) => button.className.includes("bg-action") && button.textContent?.includes("保存并完成训练"));
    expect(primary).toHaveLength(1);
  });
});

function writeCachedWorkout({ slug, targetWeight = 100, twoExercises = false }: { slug: string; targetWeight?: number; twoExercises?: boolean }) {
  writeClientCache("strength-training-cache:today", {
    coachRecommendations: [],
    exercises: [
      {
        exercise_id: "exercise-1",
        exercises: {
          default_increment: 2.5,
          movement_pattern: "horizontal_press",
          name: slug === "cardio_zone2" ? "Zone 2 有氧" : "杠铃卧推",
          slug,
          substitution_enabled: false,
          training_direction: slug === "cardio_zone2" ? "cardio" : "push"
        },
        id: "workout-exercise-1",
        order_index: 0,
        target_reps: 5,
        target_sets: 1,
        target_weight: targetWeight
      },
      ...(twoExercises ? [{
        exercise_id: "exercise-2",
        exercises: {
          default_increment: 2.5,
          movement_pattern: "vertical_press",
          name: "站姿推举",
          slug: "overhead_press",
          substitution_enabled: false,
          training_direction: "push"
        },
        id: "workout-exercise-2",
        order_index: 1,
        target_reps: 5,
        target_sets: 1,
        target_weight: 50
      }] : [])
    ],
    lastCompletedWorkout: null,
    nextTraining: {
      dayType: "training",
      id: "workout-1",
      name: "推 A · 强度",
      scheduledDate: "2026-07-18",
      sequenceIndex: 0,
      status: "scheduled"
    },
    restItem: null,
    setLogs: {
      "workout-exercise-1": [
        {
          actual_reps: null,
          actual_weight: null,
          completed: false,
          rpe: null,
          set_index: 1,
          target_reps: 5,
          target_weight: targetWeight,
          workout_exercise_id: "workout-exercise-1"
        }
      ],
      ...(twoExercises ? {
        "workout-exercise-2": [{
          actual_reps: null,
          actual_weight: null,
          completed: false,
          rpe: null,
          set_index: 1,
          target_reps: 5,
          target_weight: 50,
          workout_exercise_id: "workout-exercise-2"
        }]
      } : {})
    },
    userId: "user-1",
    workout: {
      id: "workout-1",
      name: "推 A · 强度",
      scheduled_date: "2026-07-18",
      sequence_index: 0,
      status: "scheduled"
    }
  });
}

function getExercise(view: HTMLElement, name: string) {
  const exercise = view.querySelector<HTMLElement>(`[data-exercise-name="${name}"]`);
  if (!exercise) throw new Error(`Missing exercise ${name}`);
  return exercise;
}

function renderTodayWorkout() {
  const nextContainer = document.createElement("div");
  document.body.append(nextContainer);
  const nextRoot = createRoot(nextContainer);
  act(() => nextRoot.render(<TodayWorkout />));
  return { container: nextContainer, root: nextRoot };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
