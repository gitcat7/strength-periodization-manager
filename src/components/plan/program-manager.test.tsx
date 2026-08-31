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

  it("keeps pending Coach advice compact until the user expands it", async () => {
    supabaseClient = createSupabaseClient({
      program: activeProgram(),
      recommendations: [
        {
          id: "recommendation-squat",
          exercise_id: "squat",
          workout_id: "workout-1",
          recommendation_type: "increase_weight",
          previous_weight: 90,
          suggested_weight: 92.5,
          reason: "动作完成稳定。",
          status: "pending",
          exercises: { name: "深蹲", slug: "squat" },
          workouts: { scheduled_date: "2026-08-24", sequence_index: 1, name: "蹲 A" }
        },
        {
          id: "recommendation-leg-press",
          exercise_id: "leg-press",
          workout_id: "workout-1",
          recommendation_type: "increase_weight",
          previous_weight: 80,
          suggested_weight: 82.5,
          reason: "辅助动作完成稳定。",
          status: "pending",
          exercises: { name: "腿举", slug: "leg_press" },
          workouts: { scheduled_date: "2026-08-24", sequence_index: 1, name: "蹲 A" }
        }
      ]
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

    expect(container.textContent).toContain("待处理 2 条");
    expect(findButton(container, "一键应用")).toBeTruthy();
    expect(findButton(container, "一键忽略")).toBeTruthy();
    expect(findButton(container, "展开建议")).toBeTruthy();
    expect(container.querySelector("#coach-pending-recommendations")?.getAttribute("aria-hidden")).toBe("true");

    await act(async () => {
      findButton(container!, "展开建议")?.click();
      await Promise.resolve();
    });
    expect(findButton(container, "收起建议")?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("调整方向：");
    expect(container.textContent).toContain("判断依据：辅助动作完成稳定。");
    expect(container.textContent).toContain("影响范围：2026-08-24 · 蹲 A 的后续未完成训练日");
    const weightInput = container.querySelector("input[aria-label='深蹲应用重量 kg']") as HTMLInputElement;
    await act(async () => {
      setInputValue(weightInput, "91");
      await Promise.resolve();
    });

    await act(async () => {
      findButton(container!, "收起建议")?.click();
      await Promise.resolve();
      findButton(container!, "展开建议")?.click();
      await Promise.resolve();
    });
    expect((container.querySelector("input[aria-label='深蹲应用重量 kg']") as HTMLInputElement).value).toBe("91");
  });

  it("previews every pending recommendation before bulk application", async () => {
    const rpcCalls: RpcCall[] = [];
    supabaseClient = createSupabaseClient({
      program: activeProgram(),
      recommendations: pendingRecommendations(),
      rpcCalls,
      previewByRecommendationId: {
        "recommendation-squat": { workouts: [{ id: "workout-2", name: "蹲 B", scheduled_date: "2026-08-26" }] },
        "recommendation-leg-press": { workouts: [{ id: "workout-3", name: "蹲 A", scheduled_date: "2026-08-28" }] }
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
      await Promise.resolve();
    });

    await act(async () => {
      findButton(container!, "一键应用")?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("确认应用 2 条建议");
    expect(container.textContent).toContain("2026-08-26 · 蹲 B");
    expect(container.textContent).toContain("2026-08-28 · 蹲 A");
    expect(rpcCalls.filter((call) => call.name === "preview_recommendation_application")).toHaveLength(2);
    expect(rpcCalls.filter((call) => call.name === "apply_recommendation")).toHaveLength(0);

    await act(async () => {
      findButton(container!, "确认应用 2 条建议")?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(rpcCalls.filter((call) => call.name === "apply_recommendation").map((call) => call.args.p_recommendation_id))
      .toEqual(["recommendation-squat", "recommendation-leg-press"]);
  });

  it("asks for confirmation before bulk ignore changes recommendation statuses", async () => {
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    supabaseClient = createSupabaseClient({ program: activeProgram(), recommendations: pendingRecommendations(), recommendationUpdates: updates });
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

    await act(async () => {
      findButton(container!, "一键忽略")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("确认忽略 2 条建议");
    expect(updates).toEqual([]);

    await act(async () => {
      findButton(container!, "确认忽略 2 条建议")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(updates.map((update) => update.id)).toEqual(["recommendation-squat", "recommendation-leg-press"]);
    expect(updates.every((update) => update.patch.status === "rejected")).toBe(true);
  });

  it("stops bulk application at the first failed recommendation and keeps later advice pending", async () => {
    const rpcCalls: RpcCall[] = [];
    supabaseClient = createSupabaseClient({
      program: activeProgram(),
      recommendations: [
        ...pendingRecommendations(),
        {
          id: "recommendation-calf-raise",
          exercise_id: "calf-raise",
          workout_id: "workout-1",
          recommendation_type: "increase_weight",
          previous_weight: 50,
          suggested_weight: 52.5,
          reason: "完成稳定。",
          status: "pending",
          exercises: { name: "站姿提踵", slug: "standing_calf_raise" },
          workouts: { scheduled_date: "2026-08-24", sequence_index: 1, name: "蹲 A" }
        }
      ],
      applyRecommendationErrorId: "recommendation-leg-press",
      rpcCalls
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
    await act(async () => {
      findButton(container!, "一键应用")?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      findButton(container!, "确认应用 3 条建议")?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(rpcCalls.filter((call) => call.name === "apply_recommendation").map((call) => call.args.p_recommendation_id))
      .toEqual(["recommendation-squat", "recommendation-leg-press"]);
    expect(container.textContent).toContain("批量应用在腿举处失败，请重试。");
    expect(container.textContent).toContain("站姿提踵");
  });

  it("shows only the next workout until the full plan is expanded", async () => {
    supabaseClient = createSupabaseClient({
      program: activeProgram(),
      workouts: [
        { day_type: "training", id: "workout-1", name: "蹲 A", prescription_revision: 1, schedule_index: 1, scheduled_date: "2026-08-24", sequence_index: 1, status: "scheduled" },
        { day_type: "training", id: "workout-2", name: "推 B", prescription_revision: 1, schedule_index: 2, scheduled_date: "2026-08-26", sequence_index: 2, status: "scheduled" },
        { day_type: "training", id: "workout-3", name: "拉 A", prescription_revision: 1, schedule_index: 3, scheduled_date: "2026-08-28", sequence_index: 3, status: "scheduled" }
      ]
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

    expect(container.textContent).toContain("计划内容 · 共 3 节");
    expect(container.textContent).toContain("蹲 A");
    expect(container.textContent).not.toContain("推 B");
    expect(container.textContent).not.toContain("拉 A");
    expect(findButton(container, "展开完整计划")).toBeTruthy();

    await act(async () => {
      findButton(container!, "展开完整计划")?.click();
      await Promise.resolve();
    });
    expect(findButton(container, "收起完整计划")?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("推 B");
    expect(container.textContent).toContain("拉 A");
    expect(findButton(container, "收起完整计划")?.className).toContain("h-11");
    expect(findButton(container, "收起完整计划")?.className).toContain("whitespace-nowrap");
    expect(container.querySelector("#full-plan-workouts")?.className).toContain("motion-reduce:transition-none");
  });

  it("renders every action in the next workout at its natural height while the full plan is collapsed", async () => {
    const nextWorkoutExercises = Array.from({ length: 12 }, (_, index) => ({
      exercise_id: `exercise-${index + 1}`,
      exercises: { is_main_lift: index === 0, name: `动作 ${index + 1}`, slug: `exercise_${index + 1}`, training_direction: "squat" },
      id: `workout-exercise-${index + 1}`,
      order_index: index + 1,
      target_reps: 8,
      target_sets: 2,
      target_weight: 50,
      workout_id: "workout-next"
    }));
    supabaseClient = createSupabaseClient({
      program: activeProgram(),
      workoutExercises: nextWorkoutExercises,
      workouts: [
        { day_type: "training", id: "workout-next", name: "蹲 A", prescription_revision: 1, schedule_index: 1, scheduled_date: "2026-08-24", sequence_index: 1, status: "scheduled" },
        { day_type: "training", id: "workout-later", name: "推 B", prescription_revision: 1, schedule_index: 2, scheduled_date: "2026-08-26", sequence_index: 2, status: "scheduled" }
      ]
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

    expect(container.textContent).toContain("动作 12");
    expect(container.querySelector("#full-plan-workouts")?.className).not.toContain("max-h-[900px]");
    expect(container.querySelector("#full-plan-workouts")?.className).not.toContain("overflow-hidden");
  });

  it("shows an explicit empty state instead of presenting a completed workout as the next workout", async () => {
    supabaseClient = createSupabaseClient({
      program: activeProgram(),
      workouts: [
        { day_type: "training", id: "workout-completed", name: "蹲 A", prescription_revision: 1, schedule_index: 1, scheduled_date: "2026-08-20", sequence_index: 1, status: "completed" },
        { day_type: "rest", id: "workout-rest", name: "休息日", prescription_revision: 1, schedule_index: 2, scheduled_date: "2026-08-21", sequence_index: 2, status: "completed" }
      ]
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

    expect(container.textContent).toContain("当前周期没有待执行训练");
    expect(container.textContent).not.toContain("第 1 节 · 建议 2026-08-20");
  });
});

function activeProgram() {
  return {
    id: "active-program",
    name: "推/拉/蹲 A-B 周期",
    template_type: "push_pull_squat",
    schedule_mode: "fixed_weekdays",
    schedule_config: { weekdays: [1, 3, 5] },
    custom_template_name: null,
    status: "active",
    start_date: "2026-08-01",
    end_date: "2026-08-28"
  };
}

function pendingRecommendations() {
  return [
    {
      id: "recommendation-squat",
      exercise_id: "squat",
      workout_id: "workout-1",
      recommendation_type: "increase_weight",
      previous_weight: 90,
      suggested_weight: 92.5,
      reason: "动作完成稳定。",
      status: "pending",
      exercises: { name: "深蹲", slug: "squat" },
      workouts: { scheduled_date: "2026-08-24", sequence_index: 1, name: "蹲 A" }
    },
    {
      id: "recommendation-leg-press",
      exercise_id: "leg-press",
      workout_id: "workout-1",
      recommendation_type: "increase_weight",
      previous_weight: 80,
      suggested_weight: 82.5,
      reason: "辅助动作完成稳定。",
      status: "pending",
      exercises: { name: "腿举", slug: "leg_press" },
      workouts: { scheduled_date: "2026-08-24", sequence_index: 1, name: "蹲 A" }
    }
  ];
}

type RpcCall = { name: string; args: Record<string, unknown> };

function findButton(view: ParentNode, text: string) {
  return Array.from(view.querySelectorAll("button")).find((button) => button.textContent?.includes(text));
}

function createSupabaseClient({
  pendingAuth = false,
  profileUpsertError,
  program = null,
  completedSetWorkoutExerciseIds = [],
  recommendations = [],
  recommendationUpdates = [],
  rpcCalls = [],
  previewByRecommendationId = {},
  applyRecommendationErrorId,
  workoutExercises = [],
  workouts = []
}: {
  pendingAuth?: boolean;
  profileUpsertError?: Error;
  program?: Record<string, unknown> | null;
  completedSetWorkoutExerciseIds?: string[];
  recommendations?: Record<string, unknown>[];
  recommendationUpdates?: Array<{ id: string; patch: Record<string, unknown> }>;
  rpcCalls?: RpcCall[];
  previewByRecommendationId?: Record<string, { workouts: Array<{ id: string; name: string; scheduled_date: string }> }>;
  applyRecommendationErrorId?: string;
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
  const recommendationTable = Object.assign(createQuery({ data: recommendations, error: null }), {
    update: (patch: Record<string, unknown>) => {
      let recommendationId = "";
      const updateResult = Object.assign(Promise.resolve({ error: null }), {
        eq: (column: string, value: unknown) => {
          if (column === "id") {
            recommendationId = String(value);
            recommendationUpdates.push({ id: recommendationId, patch });
          }
          return updateResult;
        }
      });
      return updateResult;
    }
  });

  return {
    auth: { getUser: () => pendingAuth ? new Promise(() => {}) : Promise.resolve({ data: { user: { id: "user-1" } }, error: null }) },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "preview_recommendation_application") {
        return Promise.resolve({ data: previewByRecommendationId[String(args.p_recommendation_id)] ?? { workouts: [] }, error: null });
      }
      if (name === "apply_recommendation") {
        return Promise.resolve({
          data: null,
          error: args.p_recommendation_id === applyRecommendationErrorId ? { message: "apply failed" } : null
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => {
      if (table === "usr_athlete_profiles") return profileTable;
      if (table === "cfg_exercises") return createQuery({ data: mainLifts, error: null });
      if (table === "log_recommendations") return recommendationTable;
      if (table === "plan_programs") return createQuery({ data: program, error: null });
      if (table === "plan_workouts") return createQuery({ data: workouts, error: null });
      if (table === "plan_workout_exercises") return createQuery({ data: workoutExercises, error: null });
      if (table === "log_set_logs") return createQuery({ data: completedSetWorkoutExerciseIds.map((workout_exercise_id) => ({ workout_exercise_id })), error: null });
      if (table === "usr_lift_profiles") return Object.assign(createQuery({ data: [], error: null }), { upsert: () => Promise.resolve({ error: null }) });
      if (table === "ops_analytics_events") return Object.assign(createQuery({ data: [], error: null }), { insert: () => Promise.resolve({ error: null }) });
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
