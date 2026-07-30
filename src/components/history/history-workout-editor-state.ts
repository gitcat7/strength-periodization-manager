export type HistoryEditableSet = {
  actual_reps: number | null;
  actual_weight: number | null;
  completed: boolean;
  id: string;
  rpe: number | null;
  set_index: number;
  target_reps: number;
  target_weight: number;
  workout_exercise_id: string;
};

export type HistoryWorkoutEditorState = {
  durationMinutes: string;
  error: string;
  logs: HistoryEditableSet[];
  mode: "read" | "edit" | "saving";
};

export type HistoryWorkoutEditorAction =
  | { type: "begin"; durationSeconds: number | null; logs: HistoryEditableSet[] }
  | { type: "cancel" }
  | { type: "changeDuration"; value: string }
  | { type: "changeLog"; id: string; patch: Partial<HistoryEditableSet> }
  | { type: "save" }
  | { type: "saveFailed"; message: string }
  | { type: "saveSucceeded"; durationSeconds: number | null; logs: HistoryEditableSet[] };

function cloneLogs(logs: HistoryEditableSet[]) {
  return logs.map((log) => ({ ...log }));
}

export function createHistoryWorkoutEditorState(): HistoryWorkoutEditorState {
  return { durationMinutes: "", error: "", logs: [], mode: "read" };
}

export function reduceHistoryWorkoutEditor(
  state: HistoryWorkoutEditorState,
  action: HistoryWorkoutEditorAction
): HistoryWorkoutEditorState {
  if (action.type === "begin") {
    return {
      durationMinutes: action.durationSeconds === null ? "" : String(action.durationSeconds / 60),
      error: "",
      logs: cloneLogs(action.logs),
      mode: "edit"
    };
  }
  if (action.type === "cancel" || action.type === "saveSucceeded") {
    return createHistoryWorkoutEditorState();
  }
  if (action.type === "changeDuration") {
    return { ...state, durationMinutes: action.value, error: "" };
  }
  if (action.type === "changeLog") {
    return {
      ...state,
      error: "",
      logs: state.logs.map((log) => log.id === action.id ? { ...log, ...action.patch } : log)
    };
  }
  if (action.type === "save") {
    return { ...state, error: "", mode: "saving" };
  }
  return { ...state, error: action.message, mode: "edit" };
}

export function parseHistoryDurationMinutes(
  value: string
): { ok: true; seconds: number | null } | { ok: false; message: string } {
  if (value.trim() === "") return { ok: true, seconds: null };
  if (!/^\d+$/.test(value)) {
    return { ok: false, message: "训练时长请输入 1–720 的整数分钟。" };
  }
  const minutes = Number(value);
  if (minutes < 1 || minutes > 720) {
    return { ok: false, message: "训练时长请输入 1–720 的整数分钟。" };
  }
  return { ok: true, seconds: minutes * 60 };
}
