export function filterTrainingMetricWorkouts<T extends { dayType?: string; day_type?: string }>(rows: T[]): T[] {
  return rows.filter((row) => (row.dayType ?? row.day_type) === "training");
}
