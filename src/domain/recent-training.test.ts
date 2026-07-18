import { describe, expect, it } from "vitest";
import { selectRecentTraining } from "./recent-training";

describe("selectRecentTraining", () => {
  it("returns the latest completed free workout with its completed sets and kg volume", () => {
    expect(selectRecentTraining(
      [
        { day_type: "training", id: "free-latest", program_id: null, scheduled_date: "2026-07-18" },
        { day_type: "training", id: "planned-earlier", program_id: "program-1", scheduled_date: "2026-07-16" }
      ],
      [{ id: "exercise-1", workout_id: "free-latest" }],
      [
        { actual_reps: 8, actual_weight: 50, completed: true, workout_exercise_id: "exercise-1" },
        { actual_reps: 10, actual_weight: 50, completed: false, workout_exercise_id: "exercise-1" }
      ]
    )).toEqual({ completedSets: 1, id: "free-latest", scheduledDate: "2026-07-18", trainingType: "自由训练", volume: 400 });
  });

  it("labels a program workout and does not manufacture a card without a completed training row", () => {
    expect(selectRecentTraining(
      [{ day_type: "training", id: "planned", program_id: "program-1", scheduled_date: "2026-07-17" }],
      [{ id: "exercise-1", workout_id: "planned" }],
      [{ actual_reps: 5, actual_weight: 100, completed: true, workout_exercise_id: "exercise-1" }]
    )).toMatchObject({ trainingType: "周期训练" });
    expect(selectRecentTraining([], [], [])).toBeNull();
  });
});
