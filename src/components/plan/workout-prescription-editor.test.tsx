/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkoutPrescriptionEditor } from "./workout-prescription-editor";

const rpc = vi.fn(async () => ({ data: { prescription_revision: 2 }, error: null }));
vi.mock("@/lib/supabase/browser", () => ({ createBrowserSupabaseClient: () => ({ rpc }) }));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const workout = { id: "workout-1", program_id: "program-1", status: "scheduled", day_type: "training" as const, prescription_revision: 1, name: "深蹲 A" };
const exercises = [{ id: "row-1", workout_id: "workout-1", exercise_id: "squat-1", order_index: 1, target_sets: 3, target_reps: 5, target_weight: 100, exercises: { name: "深蹲", slug: "back_squat", training_direction: "squat" as const } }];
const catalog = [
  { id: "squat-1", slug: "back_squat", name: "深蹲", training_direction: "squat" as const },
  { id: "squat-2", slug: "front_squat", name: "前蹲", training_direction: "squat" as const }
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

  it("does not render structural editing controls for completed or rest days", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<WorkoutPrescriptionEditor catalog={catalog} exercises={exercises} onSaved={vi.fn()} workout={{ ...workout, status: "completed" }} />));
    expect(container.textContent).not.toContain("编辑本日动作");
  });
});
