export type ExerciseSubstitutionScope = "current_workout" | "remaining_program";

export type SubstitutionCandidate = {
  catalogExternalId: string | null;
  id: string;
  movementPattern: string | null;
  name: string;
  substitutionEnabled: boolean;
  trainingDirection: string | null;
  workoutExerciseId?: string;
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

export function isCompatibleCandidate(source: SubstitutionCandidate, candidate: SubstitutionCandidate): boolean {
  return (
    candidate.id !== source.id &&
    candidate.substitutionEnabled &&
    candidate.catalogExternalId !== null &&
    candidate.trainingDirection === source.trainingDirection &&
    candidate.movementPattern === source.movementPattern
  );
}

export function parseSubstitutionRpcResponse(data: unknown): {
  affectedCount: number;
  affectedIds: string[];
} {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("替换结果异常，请刷新页面后重试。");
  }

  const record = data as Record<string, unknown>;
  const affectedIds = record.affected_ids;
  const affectedCount = record.affected_count;

  if (!Array.isArray(affectedIds) || typeof affectedCount !== "number") {
    throw new Error("替换结果异常，请刷新页面后重试。");
  }

  return {
    affectedCount,
    affectedIds: affectedIds.map((id) => String(id))
  };
}

export function getSubstitutionErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null ? (error as { code?: string }).code : undefined;

  if (code === "42501") {
    return "权限不足，无法替换此动作。请确认当前训练属于您本人。";
  }

  if (code === "P0001") {
    return "当前动作不符合替换条件（训练已开始、不是配件或没有兼容目标）。";
  }

  if (code === "40P01") {
    return "系统繁忙，请稍后再试。";
  }

  if (code === "PGRST116") {
    return "替换结果异常，请刷新页面后重试。";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "替换失败，请重试。";
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
