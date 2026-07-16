import { describe, expect, it } from "vitest";
import {
  buildStandaloneWorkoutPayload,
  buildStandaloneWorkoutSavePayload,
  filterSelectableExercises,
  isStandaloneWorkout,
  restoreStandaloneDraft,
  toggleSelectedExercise,
  type SelectableExercise
} from "./single-workout";

const exercises: SelectableExercise[] = [
  { id: "bench", name: "bench press", category: "push", catalogExternalId: "0025", defaultIncrement: 2.5, movementPattern: "horizontal_press", slug: "barbell-bench-press", trainingDirection: "push" },
  { id: "row", name: "杠铃划船", category: "pull", defaultIncrement: 2.5, movementPattern: "horizontal_pull", slug: "barbell-row", trainingDirection: "pull" },
  { id: "squat", name: "杠铃深蹲", category: "squat", defaultIncrement: 2.5, movementPattern: "squat", slug: "barbell-squat", trainingDirection: "squat" },
  { id: "shoulder", name: "哑铃侧平举", category: "push", defaultIncrement: 1, movementPattern: "shoulder_abduction", slug: "dumbbell-lateral-raise", trainingDirection: "push" },
  { id: "arms", name: "哑铃弯举", category: "pull", defaultIncrement: 1, movementPattern: "elbow_flexion", slug: "dumbbell-curl", trainingDirection: "pull" },
  { id: "core", name: "卷腹", category: "cardio", defaultIncrement: 0, movementPattern: "trunk_flexion", slug: "crunch", trainingDirection: "cardio" },
  { id: "full", name: "波比跳", category: "cardio", defaultIncrement: 0, movementPattern: "full_body", slug: "burpee", trainingDirection: "cardio" }
];

describe("single workout domain", () => {
  it("maps catalog bridge push/pull/squat/cardio data into every text section", () => {
    expect(filterSelectableExercises(exercises, { category: "胸", query: "" })).toEqual([exercises[0]]);
    expect(filterSelectableExercises(exercises, { category: "背", query: "" })).toEqual([exercises[1]]);
    expect(filterSelectableExercises(exercises, { category: "腿", query: "" })).toEqual([exercises[2]]);
    expect(filterSelectableExercises(exercises, { category: "肩", query: "" })).toEqual([exercises[3]]);
    expect(filterSelectableExercises(exercises, { category: "手臂", query: "" })).toEqual([exercises[4]]);
    expect(filterSelectableExercises(exercises, { category: "核心", query: "" })).toEqual([exercises[5]]);
    expect(filterSelectableExercises(exercises, { category: "全身", query: "" })).toEqual([exercises[6]]);
  });

  it("searches Chinese names across sections instead of retaining the active section filter", () => {
    expect(filterSelectableExercises(exercises, { category: "胸", query: "卧推" })).toEqual([exercises[0]]);
    expect(filterSelectableExercises(exercises, { category: "胸", query: "划船" })).toEqual([exercises[1]]);
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

  it("keeps the same standalone workout id on a later draft save", () => {
    expect(buildStandaloneWorkoutSavePayload("2026-07-16", exercises.slice(0, 1))).not.toHaveProperty("workout_id");
    expect(buildStandaloneWorkoutSavePayload("2026-07-16", exercises.slice(0, 1), "draft-1")).toMatchObject({ workout_id: "draft-1" });
  });

  it("restores a saved standalone draft with its recorded sets", () => {
    expect(restoreStandaloneDraft({
      workout_id: "draft-1",
      exercises: [{ exercise_id: "bench", sets: [{ completed: true, reps: "5", rpe: "8", weight: "80" }] }]
    }, exercises)).toEqual({
      workoutId: "draft-1",
      exercises: [{ ...exercises[0], sets: [{ completed: true, reps: "5", rpe: "8", weight: "80" }] }]
    });
  });

  it("identifies standalone workouts so period sequencing can exclude them", () => {
    expect(isStandaloneWorkout({ program_id: null })).toBe(true);
    expect(isStandaloneWorkout({ program_id: "period-1" })).toBe(false);
  });
});
