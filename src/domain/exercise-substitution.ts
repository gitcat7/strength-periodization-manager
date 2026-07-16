export type ExerciseSubstitutionScope = "current_workout" | "remaining_program";

export type ExerciseSubstitutionCandidate = {
  id: string;
  trainingDirection: string | null;
  movementPattern: string | null;
  substitutionEnabled: boolean;
};

export type ExerciseSubstitutionEligibilityInput = {
  workoutStatus: "scheduled" | "draft" | "completed" | "skipped";
  orderIndex: number;
  hasCompletedSet: boolean;
  source: ExerciseSubstitutionCandidate;
  alternatives: readonly ExerciseSubstitutionCandidate[];
};

export function isExerciseSubstitutionEligible({
  workoutStatus,
  orderIndex,
  hasCompletedSet,
  source,
  alternatives
}: ExerciseSubstitutionEligibilityInput): boolean {
  if (workoutStatus !== "scheduled" && workoutStatus !== "draft") return false;
  if (orderIndex < 3 || hasCompletedSet) return false;
  if (
    !source.substitutionEnabled ||
    source.trainingDirection === null ||
    source.movementPattern === null
  ) {
    return false;
  }

  return alternatives.some(
    (alternative) =>
      alternative.id !== source.id &&
      alternative.substitutionEnabled &&
      alternative.trainingDirection === source.trainingDirection &&
      alternative.movementPattern === source.movementPattern
  );
}
