/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { writeClientCache } from "@/lib/client-cache";

const router = { replace: vi.fn() };

vi.mock("next/navigation", () => ({ useRouter: () => router }));
let supabaseClient: ReturnType<typeof createSupabaseClient> = createSupabaseClient({ pendingAuth: true });

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => supabaseClient
}));

import { ProgramManager } from "./program-manager";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  supabaseClient = createSupabaseClient({ pendingAuth: true });
});

describe("ProgramManager cache hydration", () => {
  it("keeps loading and does not render another account's cached plan before authentication resolves", () => {
    writeClientCache("strength-training-cache:plan", {
      program: {
        id: "previous-program",
        name: "另一账户的训练计划",
        template_type: "push_pull_squat",
        schedule_mode: "fixed_weekdays",
        schedule_config: { weekdays: [1, 3, 5] },
        custom_template_name: null,
        status: "active",
        start_date: "2026-07-01",
        end_date: "2026-07-28"
      },
      recommendationWeights: {},
      recommendations: [],
      userId: "previous-user",
      workoutExercises: [],
      workouts: []
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(<ProgramManager />));

    expect(container.textContent).toContain("正在读取当前训练计划");
    expect(container.textContent).not.toContain("另一账户的训练计划");
  });

  it("keeps the plan form usable when saving setup fails to load", async () => {
    supabaseClient = createSupabaseClient({ profileUpsertError: new TypeError("Load failed") });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const view = container;

    await act(async () => {
      root?.render(<ProgramManager />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const generateButton = Array.from(view.querySelectorAll("button")).find((button) => button.textContent?.includes("生成 4 周训练计划"));
    expect(generateButton).toBeTruthy();

    await act(async () => {
      selectValue(view.querySelector("select[aria-required='true']")!, "beginner");
      setInputValue(view.querySelector("input[aria-label='深蹲重量 kg']")!, "130");
      setInputValue(view.querySelector("input[aria-label='卧推重量 kg']")!, "90");
      setInputValue(view.querySelector("input[aria-label='硬拉重量 kg']")!, "150");
      setInputValue(view.querySelector("input[aria-label='推举重量 kg']")!, "50");
      generateButton?.click();
      // The richer schedule form adds render ticks; flush all pending promises
      // so the network failure message settles before asserting.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.textContent).toContain("网络连接失败，请检查网络后重试。已填写的计划参数仍会保留。");
    expect(view.textContent).not.toContain("TypeError: Load failed");
    expect(generateButton).not.toHaveProperty("disabled", true);
  });

  it("hides plan generation controls for an active program until the user chooses to modify it", async () => {
    supabaseClient = createSupabaseClient({
      program: {
        id: "active-program",
        name: "推/拉/蹲 A-B 周期",
        template_type: "push_pull_squat",
        schedule_mode: "fixed_weekdays",
        schedule_config: { weekdays: [1, 3, 5] },
        custom_template_name: null,
        status: "active",
        start_date: "2026-08-01",
        end_date: "2026-08-28"
      }
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ProgramManager />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("当前周期");
    expect(container.textContent).toContain("修改计划");
    expect(container.textContent).not.toContain("先选训练结构，再选安排方式");
    expect(container.textContent).not.toContain("训练安排与主项最近工作组");

    const modifyButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("修改计划"));
    expect(modifyButton).toBeTruthy();
    await act(async () => {
      modifyButton?.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("先选训练结构，再选安排方式");
    expect(container.textContent).toContain("训练安排与主项最近工作组");
  });

  it("does not offer plan-day structural editing after a completed set has loaded", async () => {
    supabaseClient = createSupabaseClient({
      program: {
        id: "active-program",
        name: "推/拉/蹲 A-B 周期",
        template_type: "push_pull_squat",
        schedule_mode: "fixed_weekdays",
        schedule_config: { weekdays: [1, 3, 5] },
        custom_template_name: null,
        status: "active",
        start_date: "2026-08-01",
        end_date: "2026-08-28"
      },
      completedSetWorkoutExerciseIds: ["workout-exercise-1"],
      workoutExercises: [{
        exercise_id: "bench",
        exercises: { is_main_lift: true, name: "卧推", slug: "bench_press", training_direction: "push" },
        id: "workout-exercise-1",
        order_index: 1,
        target_reps: 5,
        target_sets: 3,
        target_weight: 80,
        workout_id: "workout-1"
      }],
      workouts: [{ day_type: "training", id: "workout-1", name: "推 A", prescription_revision: 1, schedule_index: 1, scheduled_date: "2026-08-11", sequence_index: 1, status: "scheduled" }]
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ProgramManager />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("已记录完成组，本训练日的动作结构已锁定。");
    expect(container.textContent).not.toContain("调整本日动作");
  });
});

function createSupabaseClient({
  pendingAuth = false,
  profileUpsertError,
  program = null,
  completedSetWorkoutExerciseIds = [],
  workoutExercises = [],
  workouts = []
}: {
  pendingAuth?: boolean;
  profileUpsertError?: Error;
  program?: Record<string, unknown> | null;
  completedSetWorkoutExerciseIds?: string[];
  workoutExercises?: Record<string, unknown>[];
  workouts?: Record<string, unknown>[];
}) {
  const mainLifts = [
    { default_increment: 2.5, id: "squat", is_main_lift: true, name: "深蹲", slug: "squat" },
    { default_increment: 2.5, id: "bench", is_main_lift: true, name: "卧推", slug: "bench_press" },
    { default_increment: 2.5, id: "deadlift", is_main_lift: true, name: "硬拉", slug: "deadlift" },
    { default_increment: 2.5, id: "press", is_main_lift: true, name: "推举", slug: "overhead_press" }
  ];
  const createQuery = (result: unknown) => {
    const promise = Promise.resolve(result);
    const query = Object.assign(promise, {
      eq: () => query,
      in: () => query,
      limit: () => query,
      maybeSingle: () => query,
      order: () => query,
      select: () => query
    });
    return query;
  };
  const profileTable = Object.assign(createQuery({ data: null, error: null }), {
    upsert: () => profileUpsertError ? Promise.reject(profileUpsertError) : Promise.resolve({ error: null })
  });

  return {
    auth: { getUser: () => pendingAuth ? new Promise(() => {}) : Promise.resolve({ data: { user: { id: "user-1" } }, error: null }) },
    from: (table: string) => {
      if (table === "usr_athlete_profiles") return profileTable;
      if (table === "cfg_exercises") return createQuery({ data: mainLifts, error: null });
      if (table === "log_recommendations") return createQuery({ data: [], error: null });
      if (table === "plan_programs") return createQuery({ data: program, error: null });
      if (table === "plan_workouts") return createQuery({ data: workouts, error: null });
      if (table === "plan_workout_exercises") return createQuery({ data: workoutExercises, error: null });
      if (table === "log_set_logs") return createQuery({ data: completedSetWorkoutExerciseIds.map((workout_exercise_id) => ({ workout_exercise_id })), error: null });
      if (table === "usr_lift_profiles") return Object.assign(createQuery({ data: [], error: null }), { upsert: () => Promise.resolve({ error: null }) });
      return createQuery({ data: [], error: null });
    }
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function selectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}
