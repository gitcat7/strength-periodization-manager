export function resolveWorkoutExerciseName(row: {
  exercises: { name: string } | null;
  exercise_name_snapshot?: string | null;
}) {
  return row.exercises?.name ?? row.exercise_name_snapshot ?? "未命名动作";
}
