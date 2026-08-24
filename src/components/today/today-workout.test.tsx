/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { writeClientCache } from "@/lib/client-cache";

const router = { replace: vi.fn() };
const rpc = vi.fn(() => Promise.resolve({ data: { recommendations: [] }, error: null }));

vi.mock("next/navigation", () => ({
  useRouter: () => router
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    rpc,
    auth: {
      getSession: () => new Promise(() => {})
    },
    from: () => {
      const result = { data: null, error: null };
      const builder = {
        select: () => builder,
        eq: () => builder,
        gt: () => builder,
        in: () => builder,
        lt: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve(result),
        upsert: () => Promise.resolve(result),
        delete: () => builder,
        update: () => builder,
        insert: () => Promise.resolve(result),
        then: (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject)
      };
      return builder;
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
  rpc.mockClear();
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

  it("does not open a future planned session as today's workout", () => {
    writeClientCache("strength-training-cache:today", {
      coachRecommendations: [],
      exercises: [],
      lastCompletedWorkout: null,
      nextTraining: {
        dayType: "training",
        id: "future-training",
        name: "拉 B · 容量",
        scheduledDate: "2999-01-01",
        sequenceIndex: 2,
        status: "scheduled"
      },
      restItem: null,
      setLogs: {},
      userId: "user-1",
      workout: {
        id: "future-training",
        name: "拉 B · 容量",
        scheduled_date: "2999-01-01",
        sequence_index: 2,
        status: "scheduled"
      }
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(<TodayWorkout />));

    expect(container.textContent).toContain("下一次训练尚未到日期");
    expect(container.textContent).toContain("不会自动提前到今天");
    expect(container.textContent).not.toContain("保存并完成训练");
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

  it("closes the completion preview after a successful confirmation", async () => {
    writeCachedWorkout({ slug: "barbell_bench_press" });
    ({ container, root } = renderTodayWorkout());
    const view = container!;

    await act(async () => {
      await Promise.resolve();
    });

    const numberInputs = view.querySelectorAll<HTMLInputElement>('input[type="number"]');
    act(() => setInputValue(numberInputs[2]!, "7"));
    act(() => view.querySelector<HTMLInputElement>('input[aria-label="第 1 组完成"]')?.click());

    const completeButton = [...view.querySelectorAll("button")].find((button) => button.textContent === "保存并完成训练");
    act(() => completeButton?.click());
    expect(view.querySelector('[role="dialog"]')).not.toBeNull();

    const confirmButton = [...view.querySelectorAll("button")].find((button) => button.textContent === "确认完成");
    await act(async () => {
      confirmButton?.click();
      await Promise.resolve();
    });

    expect(view.querySelector('[role="dialog"]')).toBeNull();
    expect(view.textContent).toContain("训练已结束");
    expect(view.textContent).not.toContain("已提前结束");
    expect(view.textContent).toContain("本次训练摘要");
    expect(view.textContent).not.toContain("训练执行");
    expect(view.querySelectorAll('input[aria-label$="组完成"]')).toHaveLength(0);
  });

  it("ends an early-finished workout in a read-only result state without execution controls", async () => {
    writeCachedWorkout({ slug: "barbell_bench_press", targetSets: 2, completedSets: 1 });
    ({ container, root } = renderTodayWorkout());
    const view = container!;

    await act(async () => {
      await Promise.resolve();
    });

    const completeButton = [...view.querySelectorAll("button")].find((button) => button.textContent === "保存并完成训练");
    act(() => completeButton?.click());
    expect(view.querySelector('[role="dialog"]')).not.toBeNull();

    const confirmButton = [...view.querySelectorAll("button")].find((button) => button.textContent === "仍然结束训练");
    await act(async () => {
      confirmButton?.click();
      await Promise.resolve();
    });

    expect(rpc).toHaveBeenCalledWith(
      "complete_training_workout",
      expect.objectContaining({
        p_logs: expect.arrayContaining([
          expect.objectContaining({ completed: true, set_index: 1 }),
          expect.objectContaining({ completed: false, set_index: 2 })
        ])
      })
    );
    expect(view.querySelector('[role="dialog"]')).toBeNull();
    expect(view.textContent).toContain("训练已结束");
    expect(view.textContent).toContain("已提前结束");
    expect(view.textContent).toContain("完成组数");
    expect(view.textContent).toContain("1/2");
    expect(view.textContent).toContain("查看训练历史");
    expect(view.textContent).toContain("返回首页");
    expect(view.textContent).not.toContain("训练执行");
    expect(view.textContent).not.toContain("杠铃卧推");
    expect(view.querySelectorAll('input[type="number"]')).toHaveLength(0);
    expect(view.querySelectorAll('input[aria-label$="组完成"]')).toHaveLength(0);
    expect(view.textContent).not.toContain("组间休息");
    expect(view.textContent).not.toContain("训练已完成");
    expect(view.textContent).not.toContain("保存并完成训练");
  });

  it("completes a planned workout through the single atomic RPC and consumes its recommendations", async () => {
    writeCachedWorkout({ slug: "barbell_bench_press" });
    ({ container, root } = renderTodayWorkout());
    await act(async () => { await Promise.resolve(); });
    const numberInputs = container!.querySelectorAll<HTMLInputElement>('input[type="number"]');
    act(() => setInputValue(numberInputs[2]!, "7"));
    act(() => container!.querySelector<HTMLInputElement>('input[aria-label="第 1 组完成"]')?.click());
    const completeButton = [...container!.querySelectorAll("button")].find((button) => button.textContent === "保存并完成训练");
    act(() => completeButton?.click());
    const confirmButton = [...container!.querySelectorAll("button")].find((button) => button.textContent === "确认完成");
    await act(async () => { confirmButton?.click(); await Promise.resolve(); });

    expect(rpc).toHaveBeenCalledWith("complete_training_workout", expect.objectContaining({ p_workout_id: "workout-1" }));
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

  it("keeps desktop weight controls wide enough for decimal kilograms", async () => {
    writeCachedWorkout({ slug: "barbell_bench_press", targetWeight: 62.5 });
    ({ container, root } = renderTodayWorkout());

    await act(async () => {
      await Promise.resolve();
    });

    const setRow = [...container!.querySelectorAll("div")].find((element) =>
      element.className.includes("sm:grid-cols-[2.5rem_minmax(8rem,1.2fr)_minmax(7rem,1fr)_minmax(6rem,1fr)_2.25rem]")
    );
    expect(setRow).not.toBeUndefined();
    expect(container!.textContent).toContain("62.5");
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

  it("allows adding or removing sets even after an exercise is fully completed", async () => {
    writeCachedWorkout({ slug: "barbell_bench_press", targetSets: 3, completedSets: 3 });
    ({ container, root } = renderTodayWorkout());

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("3/3 组");
    const addButton = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("增加一组"));
    const removeButton = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("删除末组"));
    expect(addButton).toBeDefined();
    expect(removeButton).toBeDefined();

    act(() => addButton?.click());
    expect(container.textContent).toContain("3/4 组");
    expect(container.querySelectorAll('input[aria-label$="组完成"]')).toHaveLength(4);
    expect(JSON.parse(window.localStorage.getItem("strength-training-draft:workout-1") ?? "{}")["workout-exercise-1"]).toHaveLength(4);

    act(() => removeButton?.click());
    expect(container.textContent).toContain("3/3 组");
    expect(container.querySelectorAll('input[aria-label$="组完成"]')).toHaveLength(3);
    expect(JSON.parse(window.localStorage.getItem("strength-training-draft:workout-1") ?? "{}")["workout-exercise-1"]).toHaveLength(3);
  });
});

function writeCachedWorkout({
  slug,
  targetWeight = 100,
  targetSets = 1,
  completedSets = 0
}: {
  slug: string;
  targetWeight?: number;
  targetSets?: number;
  completedSets?: number;
}) {
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
        target_sets: targetSets,
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
      "workout-exercise-1": Array.from({ length: targetSets }, (_, index) => ({
        actual_reps: completedSets > index ? 5 : null,
        actual_weight: completedSets > index ? targetWeight : null,
        completed: completedSets > index,
        rpe: completedSets > index ? 8 : null,
        set_index: index + 1,
        target_reps: 5,
        target_weight: targetWeight,
        workout_exercise_id: "workout-exercise-1"
      }))
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
