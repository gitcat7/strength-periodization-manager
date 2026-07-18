type VisibleWorkout = { id: string };

export function getHistoryWorkoutFocusId(search: string, visibleWorkouts: readonly VisibleWorkout[]) {
  const workoutId = new URLSearchParams(search).get("workout")?.trim();
  if (!workoutId) return null;
  return visibleWorkouts.some((workout) => workout.id === workoutId) ? workoutId : null;
}
