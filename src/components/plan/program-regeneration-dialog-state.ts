export type RegenerationPreview = {
  endDate: string;
  restDays: number;
  trainingDays: number;
  unfinishedRestDays: number;
  unfinishedTrainingDays: number;
};

export type RegenerationSelection = {
  payload: { schedule_items: unknown[] };
  scheduleLabel: string;
  startDate?: string;
  templateLabel: string;
};

export type RegenerationDialogState =
  | { error: ""; open: false; phase: "idle"; preview: null; selection: null }
  | {
      error: string;
      open: true;
      phase: "preview" | "submitting" | "replacementCommitted" | "reloadFailed";
      preview: RegenerationPreview;
      selection: RegenerationSelection;
    };

export type RegenerationDialogAction =
  | { type: "open"; preview: RegenerationPreview; selection: RegenerationSelection }
  | { type: "close" }
  | { type: "confirm" }
  | { type: "replacementCommitted" }
  | { type: "reloadFailed"; message: string }
  | { type: "requestFailed"; message: string }
  | { type: "requestSucceeded" };

export function createRegenerationDialogState(): RegenerationDialogState {
  return { error: "", open: false, phase: "idle", preview: null, selection: null };
}

export function reduceRegenerationDialog(
  state: RegenerationDialogState,
  action: RegenerationDialogAction
): RegenerationDialogState {
  if (action.type === "open") {
    return { error: "", open: true, phase: "preview", preview: action.preview, selection: action.selection };
  }
  if (action.type === "close") {
    return state.phase === "submitting" || state.phase === "replacementCommitted" || state.phase === "reloadFailed"
      ? state
      : createRegenerationDialogState();
  }
  if (action.type === "confirm") {
    return state.phase === "preview" ? { ...state, error: "", phase: "submitting" } : state;
  }
  if (action.type === "replacementCommitted") {
    return state.phase === "submitting" ? { ...state, phase: "replacementCommitted" } : state;
  }
  if (action.type === "reloadFailed") {
    return state.phase === "replacementCommitted" ? { ...state, error: action.message, phase: "reloadFailed" } : state;
  }
  if (action.type === "requestFailed") {
    return state.phase === "submitting" ? { ...state, error: action.message, phase: "preview" } : state;
  }
  return createRegenerationDialogState();
}

export function buildConfirmationPayload(
  state: RegenerationDialogState
): { schedule_items: unknown[] } | null {
  return state.phase === "submitting" ? state.selection.payload : null;
}
