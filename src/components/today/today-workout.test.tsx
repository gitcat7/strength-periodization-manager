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
});

function writeCachedWorkout({ slug, targetWeight = 100 }: { slug: string; targetWeight?: number }) {
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
      }
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
      ]
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
