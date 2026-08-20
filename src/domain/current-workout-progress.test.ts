import { describe, expect, it } from "vitest";

import { buildCurrentWorkoutProgress } from "./current-workout-progress";

describe("buildCurrentWorkoutProgress", () => {
  it("counts only completed logs that belong to the current workout exercises", () => {
    expect(
      buildCurrentWorkoutProgress(
        [
          { id: "squat", target_sets: 3 },
          { id: "rdl", target_sets: 2 }
        ],
        [
          { workout_exercise_id: "squat", completed: true },
          { workout_exercise_id: "squat", completed: true },
          { workout_exercise_id: "squat", completed: true },
          { workout_exercise_id: "rdl", completed: false },
          { workout_exercise_id: "older-workout", completed: true }
        ]
      )
    ).toEqual({
      completedSets: 3,
      totalSets: 5,
      byExerciseId: {
        squat: { completedSets: 3, totalSets: 3 },
        rdl: { completedSets: 0, totalSets: 2 }
      }
    });
  });

  it("uses planned set counts before a workout has persisted any logs", () => {
    expect(
      buildCurrentWorkoutProgress([{ id: "squat", target_sets: 3 }], [])
    ).toEqual({
      completedSets: 0,
      totalSets: 3,
      byExerciseId: {
        squat: { completedSets: 0, totalSets: 3 }
      }
    });
  });
});
