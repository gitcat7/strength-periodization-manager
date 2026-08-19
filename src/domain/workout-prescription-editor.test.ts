import { describe, expect, it } from "vitest";
import {
  buildWorkoutPrescriptionPayload,
  getPrescriptionChangeSummary,
  insertPrescriptionExerciseAfter,
  removePrescriptionExerciseAt,
  restorePrescriptionExercise,
  validateWorkoutPrescriptionDraft,
  type WorkoutPrescriptionDraft
} from "@/domain/workout-prescription-editor";

const exercise = (overrides: Partial<WorkoutPrescriptionDraft["exercises"][number]> = {}) => ({
  exerciseId: "squat-1",
  slug: "back_squat",
  name: "深蹲",
  direction: "squat" as const,
  orderIndex: 1,
  targetSets: 3,
  targetReps: 5,
  targetWeight: 100,
  ...overrides
});

const draft = (overrides: Partial<WorkoutPrescriptionDraft> = {}): WorkoutPrescriptionDraft => ({
  workoutId: "workout-1",
  programId: "program-1",
  status: "scheduled",
  dayType: "training",
  direction: "squat",
  prescriptionRevision: 1,
  completedSetCount: 0,
  exercises: [exercise()],
  ...overrides
});

describe("workout prescription editor domain", () => {
  it("accepts a pending local draft and builds the narrow RPC payload", () => {
    const value = validateWorkoutPrescriptionDraft(draft());
    expect(value.ok).toBe(true);
    if (!value.ok) return;
    expect(buildWorkoutPrescriptionPayload(value.value)).toEqual({
      exercises: [{ exercise_id: "squat-1", order_index: 1, target_sets: 3, target_reps: 5, target_weight: 100 }]
    });
  });

  it.each([
    ["completed", { status: "completed" as const }],
    ["skipped", { status: "skipped" as const }],
    ["rest", { dayType: "rest" as const }],
    ["completed set", { completedSetCount: 1 }]
  ])("rejects %s workout structural edits", (_label, overrides) => {
    const result = validateWorkoutPrescriptionDraft(draft(overrides));
    expect(result).toEqual(expect.objectContaining({ ok: false }));
  });

  it("rejects duplicate, non-contiguous, out-of-range, external, and incompatible exercises", () => {
    expect(validateWorkoutPrescriptionDraft(draft({ exercises: [exercise(), exercise({ exerciseId: "squat-1", orderIndex: 2 })] })).ok).toBe(false);
    expect(validateWorkoutPrescriptionDraft(draft({ exercises: [exercise({ orderIndex: 2 })] })).ok).toBe(false);
    expect(validateWorkoutPrescriptionDraft(draft({ exercises: [exercise({ targetSets: 0 })] })).ok).toBe(false);
    expect(validateWorkoutPrescriptionDraft(draft({ exercises: [exercise({ provider: "manual" })] })).ok).toBe(false);
    expect(validateWorkoutPrescriptionDraft(draft({ exercises: [exercise({ direction: "push" })] })).ok).toBe(false);
  });

  it("summarizes additions, removals, moves, and target changes", () => {
    const before = [exercise(), exercise({ exerciseId: "squat-2", slug: "front_squat", name: "前蹲", orderIndex: 2, targetSets: 2 })];
    const after = [exercise({ orderIndex: 2, targetSets: 4 }), exercise({ exerciseId: "squat-3", slug: "leg_press", name: "腿举", orderIndex: 1 })];
    expect(getPrescriptionChangeSummary(before, after)).toEqual({ added: 1, removed: 1, moved: 1, changed: 1 });
  });

  it("inserts after the selected action and keeps order indexes contiguous", () => {
    const current = [exercise(), exercise({ exerciseId: "squat-2", orderIndex: 2 })];
    const inserted = insertPrescriptionExerciseAfter(
      current,
      0,
      exercise({ exerciseId: "squat-3", name: "腿举", orderIndex: 99, targetSets: 2, targetReps: 8, targetWeight: 0 })
    );
    expect(inserted.map((item) => [item.exerciseId, item.orderIndex])).toEqual([
      ["squat-1", 1],
      ["squat-3", 2],
      ["squat-2", 3]
    ]);
  });

  it("removes an action and restores it to the original position", () => {
    const current = [exercise(), exercise({ exerciseId: "squat-2", orderIndex: 2 })];
    const result = removePrescriptionExerciseAt(current, 0);
    expect(result?.exercises.map((item) => item.exerciseId)).toEqual(["squat-2"]);
    expect(restorePrescriptionExercise(result!.exercises, result!.removal)).toEqual(current);
  });

  it("refuses to remove the final action or insert beyond twelve actions", () => {
    expect(removePrescriptionExerciseAt([exercise()], 0)).toBeNull();
    const twelve = Array.from({ length: 12 }, (_, index) => exercise({ exerciseId: `squat-${index}`, orderIndex: index + 1 }));
    expect(insertPrescriptionExerciseAfter(twelve, 0, exercise({ exerciseId: "extra" }))).toEqual(twelve);
  });
});
