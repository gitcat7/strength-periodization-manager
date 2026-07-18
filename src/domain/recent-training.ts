type CompletedWorkout = {
  day_type?: string;
  id: string;
  program_id: string | null;
  scheduled_date: string;
};

type WorkoutExercise = { id: string; workout_id: string };
type SetLog = { actual_reps: number | null; actual_weight: number | null; completed: boolean; workout_exercise_id: string };

export type RecentTraining = {
  completedSets: number;
  id: string;
  scheduledDate: string;
  trainingType: "自由训练" | "周期训练";
  volume: number;
};

export function selectRecentTraining(
  completedWorkouts: readonly CompletedWorkout[],
  workoutExercises: readonly WorkoutExercise[],
  setLogs: readonly SetLog[]
): RecentTraining | null {
  const workout = completedWorkouts
    .filter((item) => item.day_type === "training")
    .reduce<CompletedWorkout | null>((latest, item) => !latest || item.scheduled_date > latest.scheduled_date ? item : latest, null);
  if (!workout) return null;

  const exerciseIds = new Set(workoutExercises.filter((exercise) => exercise.workout_id === workout.id).map((exercise) => exercise.id));
  const completedLogs = setLogs.filter((log) => log.completed && exerciseIds.has(log.workout_exercise_id));

  return {
    completedSets: completedLogs.length,
    id: workout.id,
    scheduledDate: workout.scheduled_date,
    trainingType: workout.program_id ? "周期训练" : "自由训练",
    volume: completedLogs.reduce((total, log) => total + Number(log.actual_weight ?? 0) * Number(log.actual_reps ?? 0), 0)
  };
}
