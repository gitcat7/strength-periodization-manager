import { expect, it } from "vitest";
import { resolveWorkoutExerciseName } from "./workout-exercise-presentation";

it("renders an external workout row from its immutable snapshot when exercises join is null", () => {
  expect(resolveWorkoutExerciseName({ exercises: null, exercise_name_snapshot: "Bench press" })).toBe("Bench press");
});
