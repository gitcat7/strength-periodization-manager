import { describe, expect, it } from "vitest";
import {
  buildStandaloneWorkoutPayload,
  filterSelectableExercises,
  isStandaloneWorkout,
  toggleSelectedExercise,
  type SelectableExercise
} from "./single-workout";

const exercises: SelectableExercise[] = [
  { id: "bench", name: "杠铃卧推", category: "chest", defaultIncrement: 2.5 },
  { id: "row", name: "杠铃划船", category: "back", defaultIncrement: 2.5 },
  { id: "squat", name: "杠铃深蹲", category: "legs", defaultIncrement: 2.5 }
];

describe("single workout domain", () => {
  it("filters text exercises by Chinese query and category", () => {
    expect(filterSelectableExercises(exercises, { category: "胸", query: "卧推" })).toEqual([exercises[0]]);
  });

  it("does not add the same exercise twice", () => {
    const once = toggleSelectedExercise([], exercises[0]);
    expect(toggleSelectedExercise(once, exercises[0])).toEqual(once);
  });

  it("creates a training payload without a program", () => {
    const payload = buildStandaloneWorkoutPayload("2026-07-16", [exercises[0]]);
    expect(payload.workout).toMatchObject({
      program_id: null,
      day_type: "training",
      name: "单次训练 · 2026-07-16",
      schedule_index: 0,
      sequence_index: 0
    });
    expect(payload.exercises).toHaveLength(1);
  });

  it("identifies standalone workouts so period sequencing can exclude them", () => {
    expect(isStandaloneWorkout({ program_id: null })).toBe(true);
    expect(isStandaloneWorkout({ program_id: "period-1" })).toBe(false);
  });
});
