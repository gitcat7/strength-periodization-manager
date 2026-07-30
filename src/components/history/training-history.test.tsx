/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const rpc = vi.fn(async () => ({
  data: {
    duration_seconds: 3000,
    recommendations: [],
    set_logs: [{
      actual_reps: 5,
      actual_weight: 82.5,
      completed: true,
      id: "log-1",
      rpe: 8,
      set_index: 1,
      target_reps: 5,
      target_weight: 80,
      workout_exercise_id: "exercise-1"
    }],
    workout_id: "workout-1"
  },
  error: null
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => createSupabaseClient()
}));

import { getHistorySaveErrorMessage, TrainingHistory } from "./training-history";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

it("normalizes network and unknown history save errors", () => {
  expect(getHistorySaveErrorMessage(new TypeError("Load failed")))
    .toBe("网络连接失败，请检查网络后重试。修改草稿仍会保留。");
  expect(getHistorySaveErrorMessage(new Error("database internals")))
    .toBe("历史训练保存失败，请重试。修改草稿仍会保留。");
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  window.localStorage.clear();
  rpc.mockClear();
});

it("keeps history read-only until editing and saves duration, logs, and Coach refresh atomically", async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<TrainingHistory />);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(container.textContent).toContain("当天训练摘要");
  expect(container.querySelectorAll("input[type='number']")).toHaveLength(0);

  act(() => clickButton(container!, "查看详情"));
  act(() => clickButton(container!, "修改记录"));
  act(() => {
    setInputValue(container!.querySelector("input[aria-label='实际训练时长（分钟）']")!, "50");
    setInputValue(container!.querySelector("input[aria-label='第 1 组重量 kg']")!, "82.5");
  });

  await act(async () => {
    clickButton(container!, "保存修改");
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(rpc).toHaveBeenCalledWith("revise_completed_workout", {
    p_duration_seconds: 3000,
    p_logs: expect.arrayContaining([
      expect.objectContaining({ actual_weight: 82.5, set_index: 1 })
    ]),
    p_workout_id: "workout-1"
  });
  expect(container.textContent).toContain("历史训练已保存，Coach 建议已重新计算。");
});

function createSupabaseClient() {
  const workouts = [{
    completed_at: "2026-07-30T10:00:00Z",
    day_type: "training",
    duration_seconds: 2700,
    id: "workout-1",
    name: "推 A",
    scheduled_date: "2026-07-30",
    status: "completed"
  }];
  const exercises = [{
    exercise_metadata_snapshot: null,
    exercise_name_snapshot: null,
    exercise_provider: null,
    exercises: { name: "卧推", slug: "bench_press", training_direction: "push" },
    external_exercise_id: null,
    id: "exercise-1",
    order_index: 0,
    target_reps: 5,
    target_sets: 1,
    target_weight: 80,
    workout_id: "workout-1"
  }];
  const logs = [{
    actual_reps: 5,
    actual_weight: 80,
    completed: true,
    id: "log-1",
    rpe: 8,
    set_index: 1,
    target_reps: 5,
    target_weight: 80,
    workout_exercise_id: "exercise-1"
  }];
  const createQuery = (result: unknown) => {
    const query = Object.assign(Promise.resolve(result), {
      eq: () => query,
      in: () => query,
      order: () => query,
      select: () => query
    });
    return query;
  };
  return {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "user-1" } } }, error: null }) },
    from: (table: string) => {
      if (table === "plan_workouts") return createQuery({ data: workouts, error: null });
      if (table === "plan_workout_exercises") return createQuery({ data: exercises, error: null });
      if (table === "log_set_logs") return createQuery({ data: logs, error: null });
      if (table === "log_recommendations") return createQuery({ data: [], error: null });
      return createQuery({ data: [], error: null });
    },
    rpc
  };
}

function clickButton(view: HTMLElement, label: string) {
  const button = Array.from(view.querySelectorAll("button")).find((item) => item.textContent?.includes(label));
  if (!button) throw new Error(`button not found: ${label}`);
  button.click();
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
