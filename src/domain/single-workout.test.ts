import { describe, expect, it } from "vitest";
import {
  buildStandaloneWorkoutPayload,
  buildStandaloneWorkoutSavePayload,
  filterSelectableExercises,
  isStandaloneWorkout,
  parseStandaloneWorkoutDraft,
  restoreStandaloneDraft,
  toggleSelectedExercise,
  type SelectableExercise
} from "./single-workout";
import { reviewedExercises } from "./reviewed-exercise-library";

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

  it("serializes an external standalone exercise without a local exercise id", () => {
    const payload = buildStandaloneWorkoutSavePayload("2026-07-16", [{
      externalReference: {
        category: "Chest",
        equipment: ["Barbell"],
        externalId: "42",
        muscles: ["Pectoralis major"],
        name: "Bench press",
        provider: "wger",
        sourceUrl: "https://wger.de/en/exercise/42"
      },
      sets: [{ completed: true, reps: "5", rpe: "8", weight: "80" }]
    }]);

    expect(payload.exercises[0]).toMatchObject({
      exercise_id: null,
      exercise_metadata_snapshot: {
        category: "Chest",
        equipment: ["Barbell"],
        muscles: ["Pectoralis major"],
        sourceUrl: "https://wger.de/en/exercise/42"
      },
      exercise_name_snapshot: "Bench press",
      exercise_provider: "wger",
      external_exercise_id: "42"
    });
  });

  it("serializes a user-owned manual action as a bounded standalone snapshot", () => {
    const payload = buildStandaloneWorkoutSavePayload("2026-07-16", [{
      manualExercise: {
        equipment: ["哑铃"],
        id: "manual:00000000-0000-4000-8000-000000000001",
        loadType: "weighted",
        muscles: ["背部"],
        name: "酒店健身房划船"
      },
      sets: [{ completed: true, reps: "10", rpe: "7", weight: "20" }]
    }]);

    expect(payload.exercises[0]).toMatchObject({
      exercise_id: null,
      exercise_metadata_snapshot: { equipment: ["哑铃"], loadType: "weighted", muscles: ["背部"] },
      exercise_name_snapshot: "酒店健身房划船",
      exercise_provider: "manual",
      external_exercise_id: "manual:00000000-0000-4000-8000-000000000001"
    });
  });

  it("serializes a reviewed product action without creating a public database exercise", () => {
    const reviewed = reviewedExercises.find((item) => item.id === "barbell-bench-press");
    expect(reviewed).toBeDefined();
    const payload = buildStandaloneWorkoutSavePayload("2026-07-16", [{
      reviewedExercise: reviewed!,
      sets: [{ completed: false, reps: "", rpe: "", weight: "" }]
    }]);

    expect(payload.exercises[0]).toMatchObject({
      exercise_id: null,
      exercise_name_snapshot: "杠铃卧推",
      exercise_provider: "reviewed",
      external_exercise_id: "reviewed:barbell-bench-press"
    });
  });

  it("accepts a manual snapshot when restoring the caller draft", () => {
    expect(() => parseStandaloneWorkoutDraft({
      exercises: [{
        exercise_id: null,
        exercise_metadata_snapshot: { equipment: [], loadType: "bodyweight", muscles: [] },
        exercise_name_snapshot: "旅行深蹲",
        exercise_provider: "manual",
        external_exercise_id: "manual:00000000-0000-4000-8000-000000000001",
        sets: [{ completed: false, reps: "", rpe: "", weight: "" }]
      }],
      workout_id: "draft-1"
    })).not.toThrow();
  });

  it("rejects a stored row that mixes a local id and an external reference", () => {
    expect(() => parseStandaloneWorkoutDraft({
      exercises: [{
        exercise_id: "bench",
        exercise_name_snapshot: "Bench press",
        exercise_provider: "wger",
        external_exercise_id: "42",
        exercise_metadata_snapshot: { category: "Chest", equipment: [], muscles: [], sourceUrl: "https://wger.de/en/exercise/42" },
        sets: []
      }],
      workout_id: "draft-1"
    })).toThrow("INVALID_EXERCISE_REFERENCE");
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
