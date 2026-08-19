import { describe, expect, it } from "vitest";

import {
  getActiveExerciseId,
  isExerciseExpanded,
  reconcileExerciseExpansion,
  toggleExerciseExpansion
} from "./today-exercise-disclosure";

describe("today exercise disclosure", () => {
  it("selects the first exercise with an incomplete set", () => {
    expect(getActiveExerciseId([
      { exerciseId: "bench", completedSets: 4, totalSets: 4 },
      { exerciseId: "press", completedSets: 1, totalSets: 3 },
      { exerciseId: "raise", completedSets: 0, totalSets: 3 }
    ])).toBe("press");
  });

  it("ignores zero-set exercises and returns null when all work is complete", () => {
    expect(getActiveExerciseId([
      { exerciseId: "empty", completedSets: 0, totalSets: 0 },
      { exerciseId: "bench", completedSets: 1, totalSets: 1 }
    ])).toBeNull();
  });

  it("opens only the active exercise by default and respects manual overrides", () => {
    expect(isExerciseExpanded({ activeExerciseId: "press", exerciseId: "press", overrides: {} })).toBe(true);
    expect(isExerciseExpanded({ activeExerciseId: "press", exerciseId: "bench", overrides: {} })).toBe(false);
    expect(isExerciseExpanded({ activeExerciseId: "press", exerciseId: "bench", overrides: { bench: true } })).toBe(true);
    expect(toggleExerciseExpansion({}, "bench", false)).toEqual({ bench: true });
  });

  it("keeps the active incomplete exercise open when a stale collapse override exists", () => {
    expect(isExerciseExpanded({
      activeExerciseId: "press",
      exerciseId: "press",
      overrides: { press: false }
    })).toBe(true);
  });

  it("collapses a just-completed exercise", () => {
    expect(reconcileExerciseExpansion({
      before: [
        { exerciseId: "bench", completedSets: 3, totalSets: 4 },
        { exerciseId: "press", completedSets: 0, totalSets: 3 }
      ],
      after: [
        { exerciseId: "bench", completedSets: 4, totalSets: 4 },
        { exerciseId: "press", completedSets: 0, totalSets: 3 }
      ],
      overrides: { bench: true }
    })).toEqual({ bench: false });
  });

  it("removes a stale collapsed override when a completed exercise becomes incomplete", () => {
    expect(reconcileExerciseExpansion({
      before: [{ exerciseId: "bench", completedSets: 4, totalSets: 4 }],
      after: [{ exerciseId: "bench", completedSets: 3, totalSets: 4 }],
      overrides: { bench: false }
    })).toEqual({});
  });
});
