export function filterTrainingMetricWorkouts<T extends { dayType: string }>(rows: T[]): T[] {
  return rows.filter((row) => row.dayType === "training");
}
