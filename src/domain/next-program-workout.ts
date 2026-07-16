export type ProgramWorkoutCandidate = {
  id: string;
  program_id: string | null;
  sequence_index: number | null;
  status: string;
};

export function selectNextProgramWorkout<T extends ProgramWorkoutCandidate>(
  workouts: readonly T[],
  activeProgramId: string | null
): T | null {
  if (!activeProgramId) return null;
  return workouts
    .filter((workout) => workout.program_id === activeProgramId && (workout.status === "scheduled" || workout.status === "draft"))
    .sort((left, right) => (left.sequence_index ?? Number.MAX_SAFE_INTEGER) - (right.sequence_index ?? Number.MAX_SAFE_INTEGER))[0] ?? null;
}
