export type PrescriptionDirection = "push" | "pull" | "squat" | "cardio";
export type EditableWorkoutStatus = "scheduled" | "draft" | "completed" | "skipped";

export type WorkoutPrescriptionExerciseDraft = {
  exerciseId: string;
  slug: string;
  name: string;
  direction: PrescriptionDirection;
  orderIndex: number;
  targetSets: number;
  targetReps: number;
  targetWeight: number;
  provider?: "local" | "reviewed" | "manual" | "wger" | string | null;
};

export type WorkoutPrescriptionDraft = {
  workoutId: string;
  programId: string;
  status: EditableWorkoutStatus;
  dayType: "training" | "rest";
  direction: PrescriptionDirection;
  prescriptionRevision: number;
  completedSetCount: number;
  exercises: WorkoutPrescriptionExerciseDraft[];
};

export type ValidatedWorkoutPrescriptionDraft = Omit<WorkoutPrescriptionDraft, "exercises"> & {
  exercises: WorkoutPrescriptionExerciseDraft[];
};

export type WorkoutPrescriptionValidationResult =
  | { ok: true; value: ValidatedWorkoutPrescriptionDraft }
  | { ok: false; fieldErrors: Record<string, string> };

const MIN_EXERCISES = 1;
const MAX_EXERCISES = 12;

export type PrescriptionExerciseRemoval = {
  exercise: WorkoutPrescriptionExerciseDraft;
  index: number;
};

export function reindexPrescriptionExercises(exercises: WorkoutPrescriptionExerciseDraft[]) {
  return exercises.map((exercise, index) => ({ ...exercise, orderIndex: index + 1 }));
}

export function insertPrescriptionExerciseAfter(
  exercises: WorkoutPrescriptionExerciseDraft[],
  anchorIndex: number,
  exercise: WorkoutPrescriptionExerciseDraft
) {
  if (exercises.length >= MAX_EXERCISES || anchorIndex < 0 || anchorIndex >= exercises.length) return exercises;
  const next = [...exercises];
  next.splice(anchorIndex + 1, 0, exercise);
  return reindexPrescriptionExercises(next);
}

export function removePrescriptionExerciseAt(exercises: WorkoutPrescriptionExerciseDraft[], index: number) {
  if (exercises.length <= MIN_EXERCISES || index < 0 || index >= exercises.length) return null;
  const removal = { exercise: { ...exercises[index] }, index };
  return {
    exercises: reindexPrescriptionExercises(exercises.filter((_, currentIndex) => currentIndex !== index)),
    removal
  };
}

export function restorePrescriptionExercise(
  exercises: WorkoutPrescriptionExerciseDraft[],
  removal: PrescriptionExerciseRemoval
) {
  if (exercises.length >= MAX_EXERCISES) return exercises;
  const next = [...exercises];
  next.splice(Math.min(removal.index, next.length), 0, removal.exercise);
  return reindexPrescriptionExercises(next);
}

export function validateWorkoutPrescriptionDraft(
  draft: WorkoutPrescriptionDraft
): WorkoutPrescriptionValidationResult {
  const fieldErrors: Record<string, string> = {};

  if (!draft.workoutId.trim() || !draft.programId.trim()) fieldErrors.workout = "训练日信息无效";
  if (draft.dayType !== "training" || !["scheduled", "draft"].includes(draft.status)) {
    fieldErrors.status = "仅可编辑尚未完成的训练日";
  }
  if (draft.completedSetCount > 0) fieldErrors.completed = "已有完成组的训练日不能修改动作结构";
  if (!Number.isInteger(draft.prescriptionRevision) || draft.prescriptionRevision < 1) {
    fieldErrors.revision = "训练处方版本无效，请刷新后重试";
  }
  if (draft.exercises.length < MIN_EXERCISES || draft.exercises.length > MAX_EXERCISES) {
    fieldErrors.exercises = "动作数量需为 1-12 个";
  }

  const ids = new Set<string>();
  draft.exercises.forEach((exercise, index) => {
    const prefix = `exercises.${index}`;
    if (!exercise.exerciseId.trim() || ids.has(exercise.exerciseId)) fieldErrors[`${prefix}.exerciseId`] = "动作必须来自本地动作库且不能重复";
    ids.add(exercise.exerciseId);
    if (exercise.provider && exercise.provider !== "local") fieldErrors[`${prefix}.provider`] = "只能使用本地审核动作";
    if (exercise.direction !== draft.direction) fieldErrors[`${prefix}.direction`] = "动作方向与训练日不兼容";
    if (exercise.orderIndex !== index + 1) fieldErrors[`${prefix}.orderIndex`] = "动作顺序必须连续";
    if (!Number.isInteger(exercise.targetSets) || exercise.targetSets < 1 || exercise.targetSets > 20) fieldErrors[`${prefix}.targetSets`] = "目标组数需为 1-20 组";
    if (!Number.isInteger(exercise.targetReps) || exercise.targetReps < 1 || exercise.targetReps > 1000) fieldErrors[`${prefix}.targetReps`] = "目标次数需为 1-1000 次";
    if (!Number.isFinite(exercise.targetWeight) || exercise.targetWeight < 0 || exercise.targetWeight > 10000) fieldErrors[`${prefix}.targetWeight`] = "目标重量需为 0-10000 kg";
  });

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, value: { ...draft, exercises: draft.exercises.map((exercise) => ({ ...exercise })) } };
}

export function buildWorkoutPrescriptionPayload(draft: ValidatedWorkoutPrescriptionDraft) {
  return {
    exercises: draft.exercises.map((exercise) => ({
      exercise_id: exercise.exerciseId,
      order_index: exercise.orderIndex,
      target_sets: exercise.targetSets,
      target_reps: exercise.targetReps,
      target_weight: exercise.targetWeight
    }))
  };
}

export type PrescriptionChangeSummary = { added: number; removed: number; moved: number; changed: number };

export function getPrescriptionChangeSummary(
  before: WorkoutPrescriptionExerciseDraft[],
  after: WorkoutPrescriptionExerciseDraft[]
): PrescriptionChangeSummary {
  const beforeById = new Map(before.map((exercise) => [exercise.exerciseId, exercise]));
  const afterById = new Map(after.map((exercise) => [exercise.exerciseId, exercise]));
  let moved = 0;
  let changed = 0;
  for (const [id, next] of afterById) {
    const previous = beforeById.get(id);
    if (!previous) continue;
    if (previous.orderIndex !== next.orderIndex) moved += 1;
    if (previous.targetSets !== next.targetSets || previous.targetReps !== next.targetReps || previous.targetWeight !== next.targetWeight) changed += 1;
  }
  return {
    added: [...afterById.keys()].filter((id) => !beforeById.has(id)).length,
    removed: [...beforeById.keys()].filter((id) => !afterById.has(id)).length,
    moved,
    changed
  };
}
