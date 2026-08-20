export type CurrentWorkoutExercise = {
  id: string;
  target_sets: number | null;
};

export type CurrentWorkoutSetLog = {
  workout_exercise_id: string;
  completed: boolean;
};

export type CurrentWorkoutExerciseProgress = {
  completedSets: number;
  totalSets: number;
};

export type CurrentWorkoutProgress = {
  completedSets: number;
  totalSets: number;
  byExerciseId: Record<string, CurrentWorkoutExerciseProgress>;
};

export function buildCurrentWorkoutProgress(
  exercises: readonly CurrentWorkoutExercise[],
  logs: readonly CurrentWorkoutSetLog[]
): CurrentWorkoutProgress {
  const relevantExerciseIds = new Set(exercises.map((exercise) => exercise.id));
  const logsByExerciseId = new Map<string, CurrentWorkoutSetLog[]>();

  for (const log of logs) {
    if (!relevantExerciseIds.has(log.workout_exercise_id)) continue;

    const exerciseLogs = logsByExerciseId.get(log.workout_exercise_id) ?? [];
    exerciseLogs.push(log);
    logsByExerciseId.set(log.workout_exercise_id, exerciseLogs);
  }

  const byExerciseId: Record<string, CurrentWorkoutExerciseProgress> = {};
  let completedSets = 0;
  let totalSets = 0;

  for (const exercise of exercises) {
    const exerciseLogs = logsByExerciseId.get(exercise.id) ?? [];
    const exerciseCompletedSets = exerciseLogs.filter((log) => log.completed).length;
    const plannedSets = Math.max(0, exercise.target_sets ?? 0);
    const exerciseTotalSets = Math.max(plannedSets, exerciseLogs.length);

    byExerciseId[exercise.id] = {
      completedSets: exerciseCompletedSets,
      totalSets: exerciseTotalSets
    };
    completedSets += exerciseCompletedSets;
    totalSets += exerciseTotalSets;
  }

  return { completedSets, totalSets, byExerciseId };
}
