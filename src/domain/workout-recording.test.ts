import { describe, expect, it } from "vitest";
import { buildCompletionSummary, validateRecordedSet } from "./workout-recording";

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
