export type ExerciseCompletion = {
  completedSets: number;
  exerciseId: string;
  totalSets: number;
};

export type ExerciseExpansionOverrides = Record<string, boolean>;

export function getActiveExerciseId(exercises: ExerciseCompletion[]) {
  return exercises.find(
    (exercise) => exercise.totalSets > 0 && exercise.completedSets < exercise.totalSets
  )?.exerciseId ?? null;
}

export function isExerciseExpanded({
  activeExerciseId,
  exerciseId,
  overrides
}: {
  activeExerciseId: string | null;
  exerciseId: string;
  overrides: ExerciseExpansionOverrides;
}) {
  if (exerciseId === activeExerciseId) {
    return true;
  }

  return overrides[exerciseId] ?? false;
}

export function toggleExerciseExpansion(
  overrides: ExerciseExpansionOverrides,
  exerciseId: string,
  currentExpanded: boolean
) {
  return { ...overrides, [exerciseId]: !currentExpanded };
}

export function reconcileExerciseExpansion({
  after,
  before,
  overrides
}: {
  after: ExerciseCompletion[];
  before: ExerciseCompletion[];
  overrides: ExerciseExpansionOverrides;
}) {
  const beforeById = new Map(before.map((exercise) => [exercise.exerciseId, exercise]));
  const next = { ...overrides };

  for (const exercise of after) {
    const previous = beforeById.get(exercise.exerciseId);
    const wasComplete = Boolean(previous && previous.totalSets > 0 && previous.completedSets >= previous.totalSets);
    const isComplete = exercise.totalSets > 0 && exercise.completedSets >= exercise.totalSets;
    if (!wasComplete && isComplete) next[exercise.exerciseId] = false;
    if (wasComplete && !isComplete && next[exercise.exerciseId] === false) delete next[exercise.exerciseId];
  }

  return next;
}
