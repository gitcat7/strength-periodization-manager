export function filterHistoryWorkoutsByDate<T extends { scheduled_date: string }>(workouts: T[], selectedDate: string) {
  if (!selectedDate) return workouts;
  return workouts.filter((workout) => workout.scheduled_date === selectedDate);
}
