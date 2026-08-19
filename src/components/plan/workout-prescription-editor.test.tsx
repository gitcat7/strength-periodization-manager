/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkoutPrescriptionEditor } from "./workout-prescription-editor";

const rpc = vi.fn(async (..._args: unknown[]): Promise<{ data: { prescription_revision: number } | null; error: Error | null }> => ({ data: { prescription_revision: 2 }, error: null }));
vi.mock("@/lib/supabase/browser", () => ({ createBrowserSupabaseClient: () => ({ rpc }) }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const workout = { id: "workout-1", program_id: "program-1", status: "scheduled", day_type: "training" as const, prescription_revision: 1, name: "深蹲 A" };
const exercises = [
  { id: "row-1", workout_id: "workout-1", exercise_id: "squat-1", order_index: 1, target_sets: 3, target_reps: 5, target_weight: 100, exercises: { name: "深蹲", slug: "back_squat", training_direction: "squat" as const } },
  { id: "row-2", workout_id: "workout-1", exercise_id: "squat-2", order_index: 2, target_sets: 2, target_reps: 8, target_weight: 70, exercises: { name: "前蹲", slug: "front_squat", training_direction: "squat" as const } },
  { id: "row-3", workout_id: "workout-1", exercise_id: "squat-3", order_index: 3, target_sets: 2, target_reps: 10, target_weight: 80, exercises: { name: "腿举", slug: "leg_press", training_direction: "squat" as const } }
];
const catalog = [
  { id: "squat-1", slug: "back_squat", name: "深蹲", training_direction: "squat" as const },
  { id: "squat-2", slug: "front_squat", name: "前蹲", training_direction: "squat" as const },
  { id: "squat-3", slug: "leg_press", name: "腿举", training_direction: "squat" as const },
  { id: "squat-4", slug: "leg_extension", name: "腿屈伸", training_direction: "squat" as const }
];

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  rpc.mockClear();
});

describe("WorkoutPrescriptionEditor", () => {
  it("only exposes pending training days and saves through one RPC after confirmation", async () => {
    const onSaved = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<WorkoutPrescriptionEditor catalog={catalog} exercises={exercises} onSaved={onSaved} workout={workout} />);
    });
    expect(container.textContent).toContain("编辑本日动作");
    await act(async () => container?.querySelector("button")?.click());
    expect(container.textContent).toContain("预览并保存");
    await act(async () => Array.from(container!.querySelectorAll("button")).find((button) => button.textContent?.includes("预览并保存"))?.click());
    expect(container.textContent).toContain("确认保存本日处方");
    await act(async () => Array.from(container!.querySelectorAll("button")).find((button) => button.textContent?.includes("确认保存本日处方"))?.click());
    expect(rpc).toHaveBeenCalledTimes(1);
    const calls = rpc.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
    expect(calls[0]?.[0]).toBe("revise_workout_prescription");
    expect(calls[0]?.[1]).toEqual(expect.objectContaining({ p_workout_id: "workout-1", p_expected_revision: 1 }));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("lets every action insert after itself, delete with undo, and saves the ordered draft once", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<WorkoutPrescriptionEditor catalog={catalog} exercises={exercises} onSaved={vi.fn()} workout={workout} />));
    await act(async () => container?.querySelector("button")?.click());

    expect(container.querySelectorAll("[data-prescription-exercise-card]")).toHaveLength(3);
    expect(findButtons("删除动作")).toHaveLength(3);
    expect(findButtons("在此动作后新增")).toHaveLength(3);
    expect(container.querySelectorAll('select[aria-label^="第 "]')).toHaveLength(0);

    await act(async () => findButtons("在此动作后新增")[0]?.click());
    const addSelect = container.querySelector<HTMLSelectElement>('select[aria-label="在深蹲后新增动作"]');
    act(() => setSelectValue(addSelect!, "squat-4"));
    expect(cardNames()).toEqual(["深蹲", "腿屈伸", "前蹲", "腿举"]);

    await act(async () => findButtons("删除动作")[1]?.click());
    expect(container.textContent).toContain("已删除腿屈伸");
    expect(cardNames()).toEqual(["深蹲", "前蹲", "腿举"]);
    await act(async () => findButton("撤销删除")?.click());
    expect(cardNames()).toEqual(["深蹲", "腿屈伸", "前蹲", "腿举"]);

    await act(async () => findButton("预览并保存")?.click());
    await act(async () => findButton("确认保存本日处方")?.click());
    expect(rpc).toHaveBeenCalledTimes(1);
    const calls = rpc.mock.calls as unknown as Array<[string, { p_payload: { exercises: Array<{ exercise_id: string }> } }]>;
    expect(calls[0]?.[1].p_payload.exercises.map((item) => item.exercise_id)).toEqual(["squat-1", "squat-4", "squat-2", "squat-3"]);
  });

  it("does not write on cancel and keeps the action-card draft after a save failure", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<WorkoutPrescriptionEditor catalog={catalog} exercises={exercises} onSaved={vi.fn()} workout={workout} />));
    await act(async () => container?.querySelector("button")?.click());
    await act(async () => findButtons("删除动作")[1]?.click());
    expect(container.querySelectorAll("[data-prescription-exercise-card]")).toHaveLength(2);
    await act(async () => findButton("取消")?.click());
    expect(rpc).not.toHaveBeenCalled();

    await act(async () => container?.querySelector("button")?.click());
    expect(container.querySelectorAll("[data-prescription-exercise-card]")).toHaveLength(3);
    rpc.mockResolvedValueOnce({ data: null, error: new Error("network") });
    await act(async () => findButton("预览并保存")?.click());
    await act(async () => findButton("确认保存本日处方")?.click());
    expect(container.querySelectorAll("[data-prescription-exercise-card]")).toHaveLength(3);
    expect(container.textContent).toContain("保存训练处方失败");
  });

  it("does not render structural editing controls for completed or rest days", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<WorkoutPrescriptionEditor catalog={catalog} exercises={exercises} onSaved={vi.fn()} workout={{ ...workout, status: "completed" }} />));
    expect(container.textContent).not.toContain("编辑本日动作");

    act(() => root?.render(<WorkoutPrescriptionEditor catalog={catalog} exercises={exercises} onSaved={vi.fn()} workout={{ ...workout, completed_set_count: 1 }} />));
    expect(container.textContent).not.toContain("编辑本日动作");
  });
});

function findButtons(text: string) {
  return [...container!.querySelectorAll("button")].filter((button) => button.textContent?.includes(text));
}

function findButton(text: string) {
  return findButtons(text)[0];
}

function cardNames() {
  return [...container!.querySelectorAll("[data-prescription-exercise-card] h5")].map((heading) => heading.textContent);
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}
