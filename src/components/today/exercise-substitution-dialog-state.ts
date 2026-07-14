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
  | { type: "setSaving"; saving: boolean }
  | { type: "open"; source: SubstitutionCandidate; alternatives: SubstitutionCandidate[] }
  | { type: "reset" };

export type ExerciseSubstitutionDialogResult =
  | { type: "cancel"; state: ExerciseSubstitutionDialogState }
  | { type: "confirm"; scope: ExerciseSubstitutionScope; source: SubstitutionCandidate; target: SubstitutionCandidate }
  | { type: "idle"; state: ExerciseSubstitutionDialogState }
  | { type: "state"; state: ExerciseSubstitutionDialogState }
  | { type: "reject"; reason: "saving" };

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

  if (!Array.isArray(affectedIds) || affectedIds.some((id) => typeof id !== "string") || typeof affectedCount !== "number") {
    throw new Error("替换结果异常，请刷新页面后重试。");
  }

  if (!Number.isFinite(affectedCount) || affectedCount < 0 || !Number.isInteger(affectedCount)) {
    throw new Error("替换结果异常，请刷新页面后重试。");
  }

  const idStrings = affectedIds.map((id) => String(id));
  if (idStrings.length === 0 || idStrings.some((id) => id.length === 0)) {
    throw new Error("替换结果异常，请刷新页面后重试。");
  }

  if (affectedCount !== idStrings.length) {
    throw new Error("替换结果异常，请刷新页面后重试。");
  }

  if (affectedCount === 0) {
    throw new Error("替换结果异常，请刷新页面后重试。");
  }

  return {
    affectedCount,
    affectedIds: idStrings
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

export function getUnknownErrorMessage(): string {
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
): ExerciseSubstitutionDialogState {
  switch (action.type) {
    case "open": {
      return getInitialExerciseSubstitutionDialogState(action.source, action.alternatives);
    }
    case "reset": {
      return {
        candidates: state.candidates,
        error: null,
        open: false,
        saving: false,
        scope: "current_workout",
        source: state.source,
        targetId: null
      };
    }
    case "selectTarget": {
      const target = state.candidates.find((candidate) => candidate.id === action.targetId);
      return {
        ...state,
        error: null,
        targetId: target ? target.id : null
      };
    }
    case "selectScope":
      return { ...state, scope: action.scope };
    case "setSaving":
      return { ...state, saving: action.saving };
    case "setError":
      return { ...state, error: action.error };
    case "confirm": {
      return state;
    }
    case "cancel": {
      if (state.saving) return state;

      return {
        ...state,
        error: null,
        open: false,
        saving: false,
        scope: "current_workout",
        targetId: null
      };
    }
    default:
      return state;
  }
}

export function getSelectedTarget(state: ExerciseSubstitutionDialogState): SubstitutionCandidate | null {
  return state.candidates.find((candidate) => candidate.id === state.targetId) ?? null;
}

export function getSubstitutionConfirmResult(
  state: ExerciseSubstitutionDialogState
): { type: "confirm"; scope: ExerciseSubstitutionScope; source: SubstitutionCandidate; target: SubstitutionCandidate } | null {
  if (state.saving || !state.targetId) return null;

  const target = state.candidates.find((candidate) => candidate.id === state.targetId);
  if (!target) return null;

  return {
    scope: state.scope,
    source: state.source,
    target,
    type: "confirm"
  };
}
