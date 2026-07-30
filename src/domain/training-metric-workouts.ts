type MetricWorkoutLike = {
  dayType?: string;
  day_type?: string;
  status?: string;
  skipReason?: string | null;
  skip_reason?: string | null;
};

// A workout only feeds tonnage, e1RM, PR readiness, recommendations, and CSV
// metrics when it is a real training row that was not skipped. In particular a
// recovery_strategy skip is a scheduling artifact, never a completed or failed
// training.
export function isMetricEligibleWorkout(row: MetricWorkoutLike): boolean {
  if ((row.dayType ?? row.day_type) !== "training") return false;
  if (row.status === "skipped") return false;
  return true;
}

export function filterTrainingMetricWorkouts<T extends MetricWorkoutLike>(rows: T[]): T[] {
  return rows.filter(isMetricEligibleWorkout);
}
