export type ExerciseSubstitutionScope = "current_workout" | "remaining_program";

export type SubstitutionCandidate = {
  catalogExternalId: string | null;
  id: string;
  movementPattern: string | null;
  name: string;
  substitutionEnabled: boolean;
  trainingDirection: string | null;
};

export type ExerciseSubstitutionDialogState = {
  candidates: SubstitutionCandidate[];
  error: string | null;
  open: boolean;
  saving: boolean;
  scope: ExerciseSubstitutionScope;
  source: SubstitutionCandidate;
  targetId: string | null;
};

export type ExerciseSubstitutionDialogAction =
  | { type: "cancel" }
  | { type: "confirm" }
  | { type: "selectScope"; scope: ExerciseSubstitutionScope }
  | { type: "selectTarget"; targetId: string }
  | { type: "setError"; error: string | null }
  | { type: "setSaving"; saving: boolean };

export type ExerciseSubstitutionDialogResult =
  | { type: "cancel"; state: ExerciseSubstitutionDialogState }
  | { type: "confirm"; scope: ExerciseSubstitutionScope; source: SubstitutionCandidate; target: SubstitutionCandidate }
  | { type: "idle"; state: ExerciseSubstitutionDialogState }
  | { type: "state"; state: ExerciseSubstitutionDialogState };

function isCompatibleCandidate(source: SubstitutionCandidate, candidate: SubstitutionCandidate): boolean {
  return (
    candidate.id !== source.id &&
    candidate.substitutionEnabled &&
    candidate.catalogExternalId !== null &&
    candidate.trainingDirection === source.trainingDirection &&
    candidate.movementPattern === source.movementPattern
  );
}

export function getInitialExerciseSubstitutionDialogState(
  source: SubstitutionCandidate,
  alternatives: SubstitutionCandidate[]
): ExerciseSubstitutionDialogState {
  return {
    candidates: alternatives.filter((candidate) => isCompatibleCandidate(source, candidate)),
    error: null,
    open: true,
    saving: false,
    scope: "current_workout",
    source,
    targetId: null
  };
}

export function exerciseSubstitutionDialogReducer(
  state: ExerciseSubstitutionDialogState,
  action: ExerciseSubstitutionDialogAction
): ExerciseSubstitutionDialogResult {
  switch (action.type) {
    case "selectTarget": {
      const target = state.candidates.find((candidate) => candidate.id === action.targetId);
      return {
        state: {
          ...state,
          error: null,
          targetId: target ? target.id : null
        },
        type: "state"
      };
    }
    case "selectScope":
      return {
        state: { ...state, scope: action.scope },
        type: "state"
      };
    case "setSaving":
      return {
        state: { ...state, saving: action.saving },
        type: "state"
      };
    case "setError":
      return {
        state: { ...state, error: action.error },
        type: "state"
      };
    case "confirm": {
      if (state.saving || !state.targetId) return { type: "idle", state };

      const target = state.candidates.find((candidate) => candidate.id === state.targetId);
      if (!target) return { type: "idle", state };

      return {
        scope: state.scope,
        source: state.source,
        target,
        type: "confirm"
      };
    }
    case "cancel": {
      return {
        state: {
          ...state,
          error: null,
          open: false,
          saving: false,
          scope: "current_workout",
          targetId: null
        },
        type: "cancel"
      };
    }
    default:
      return { type: "idle", state };
  }
}

export function getSelectedTarget(state: ExerciseSubstitutionDialogState): SubstitutionCandidate | null {
  return state.candidates.find((candidate) => candidate.id === state.targetId) ?? null;
}
