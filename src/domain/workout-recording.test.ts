import { describe, expect, it } from "vitest";
import { buildCompletionSummary, requiresRpeForStandaloneExercise, requiresRpeForWorkoutExercise, resolveCompletedSetValues, resolveSetLoadType, validateRecordedSet } from "./workout-recording";

describe("workout recording", () => {
  it("requires reps, weight, and RPE for a completed weighted set", () => {
    expect(validateRecordedSet({ completed: true, reps: "", rpe: "", weight: "" }, "weighted")).toMatchObject({
      reps: expect.stringContaining("次数"),
      rpe: expect.stringContaining("RPE"),
      weight: expect.stringContaining("重量")
    });
  });

  it("rejects non-numeric and out-of-range values without changing the draft", () => {
    expect(validateRecordedSet({ completed: true, reps: "0", rpe: "11", weight: "abc" }, "weighted")).toMatchObject({
      reps: expect.any(String), rpe: expect.any(String), weight: expect.any(String)
    });
  });

  it("allows a completed bodyweight set without a kg value", () => {
    expect(validateRecordedSet({ completed: true, reps: "12", rpe: "7", weight: "" }, "bodyweight")).toEqual({});
  });

  it("allows a completed cardio or recovery set without RPE", () => {
    expect(
      validateRecordedSet(
        { completed: true, reps: "30", rpe: "", weight: "" },
        "bodyweight",
        { requiresRpe: false }
      )
    ).toEqual({});
  });

  it("still requires a valid load when a weighted recovery set omits RPE", () => {
    expect(
      validateRecordedSet(
        { completed: true, reps: "30", rpe: "", weight: "" },
        "weighted",
        { requiresRpe: false }
      )
    ).toEqual({ weight: "负重动作完成时需填写正数重量（kg）。" });
  });

  it("keeps an external weighted snapshot weighted even when its planned weight is zero", () => {
    expect(resolveSetLoadType({ snapshotLoadType: "weighted", targetWeight: 0 })).toBe("weighted");
  });

  it("only exempts the finite audited cardio references from standalone RPE", () => {
    expect(requiresRpeForStandaloneExercise({ provider: "reviewed", referenceId: "reviewed:treadmill-run", movementPattern: "有氧跑步" })).toBe(false);
    expect(requiresRpeForStandaloneExercise({ provider: "wger", referenceId: "42", movementPattern: "cardio" })).toBe(true);
    expect(requiresRpeForStandaloneExercise({ provider: "manual", referenceId: "manual:cardio", movementPattern: "有氧跑步" })).toBe(true);
  });

  it("keeps approved cardio snapshots exempt when a saved workout is edited in history", () => {
    expect(requiresRpeForWorkoutExercise({ provider: "reviewed", referenceId: "reviewed:treadmill-run", movementPattern: "有氧跑步" })).toBe(false);
    expect(requiresRpeForWorkoutExercise({ trainingDirection: "cardio" })).toBe(false);
    expect(requiresRpeForWorkoutExercise({ provider: "reviewed", referenceId: "reviewed:barbell-bench-press", movementPattern: "水平推" })).toBe(true);
  });

  it("normalizes legacy completed rows from their displayed planned values", () => {
    expect(
      resolveCompletedSetValues({
        actualReps: null,
        actualWeight: null,
        completed: true,
        targetReps: 5,
        targetWeight: 100
      })
    ).toEqual({ actualReps: 5, actualWeight: 100 });
  });

  it("summarizes valid weighted sets while retaining incomplete counts", () => {
    expect(buildCompletionSummary([
      { completed: true, loadType: "weighted", reps: "5", rpe: "8", weight: "100" },
      { completed: true, loadType: "weighted", reps: "10", rpe: "7", weight: "50" },
      { completed: false, loadType: "bodyweight", reps: "", rpe: "", weight: "" }
    ])).toEqual({ bestE1rm: 116.7, completedSetCount: 2, incompleteSetCount: 1, totalTonnage: 1000 });
  });

  it("returns null metrics when no completed weighted set can calculate them", () => {
    expect(buildCompletionSummary([{ completed: true, loadType: "bodyweight", reps: "15", rpe: "7", weight: "" }]))
      .toMatchObject({ bestE1rm: null, totalTonnage: null });
  });
});
