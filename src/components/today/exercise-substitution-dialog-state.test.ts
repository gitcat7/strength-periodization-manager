import { describe, expect, it } from "vitest";

import {
  exerciseSubstitutionDialogReducer,
  getInitialExerciseSubstitutionDialogState,
  type SubstitutionCandidate
} from "./exercise-substitution-dialog-state";

const source: SubstitutionCandidate = {
  catalogExternalId: "0334",
  id: "source-exercise",
  movementPattern: "shoulder_abduction",
  name: "侧平举",
  substitutionEnabled: true,
  trainingDirection: "push"
};

const compatibleTarget: SubstitutionCandidate = {
  catalogExternalId: "0178",
  id: "cable-lateral-raise",
  movementPattern: "shoulder_abduction",
  name: "绳索侧平举",
  substitutionEnabled: true,
  trainingDirection: "push"
};

const incompatiblePattern: SubstitutionCandidate = {
  catalogExternalId: "0201",
  id: "triceps-pushdown",
  movementPattern: "elbow_extension",
  name: "绳索下压",
  substitutionEnabled: true,
  trainingDirection: "push"
};

const incompatibleDirection: SubstitutionCandidate = {
  catalogExternalId: "0178",
  id: "cable-lateral-raise-pull",
  movementPattern: "shoulder_abduction",
  name: "绳索侧平举",
  substitutionEnabled: true,
  trainingDirection: "pull"
};

const disabledTarget: SubstitutionCandidate = {
  catalogExternalId: "0178",
  id: "disabled-cable-lateral-raise",
  movementPattern: "shoulder_abduction",
  name: "禁用绳索侧平举",
  substitutionEnabled: false,
  trainingDirection: "push"
};

const unmappedTarget: SubstitutionCandidate = {
  catalogExternalId: null,
  id: "unmapped-lateral-raise",
  movementPattern: "shoulder_abduction",
  name: "未映射侧平举",
  substitutionEnabled: true,
  trainingDirection: "push"
};

function applyState(
  state: ReturnType<typeof getInitialExerciseSubstitutionDialogState>,
  action: Parameters<typeof exerciseSubstitutionDialogReducer>[1]
): ReturnType<typeof getInitialExerciseSubstitutionDialogState> {
  const result = exerciseSubstitutionDialogReducer(state, action);
  if (result.type === "state" || result.type === "cancel") {
    return result.state;
  }
  return state;
}

describe("exerciseSubstitutionDialogReducer", () => {
  it("exposes only compatible candidates", () => {
    const state = getInitialExerciseSubstitutionDialogState(source, [
      compatibleTarget,
      incompatiblePattern,
      incompatibleDirection,
      disabledTarget,
      unmappedTarget
    ]);

    expect(state.candidates).toEqual([compatibleTarget]);
  });

  it("defaults scope to current_workout", () => {
    const state = getInitialExerciseSubstitutionDialogState(source, [compatibleTarget]);

    expect(state.scope).toBe("current_workout");
  });

  it("does not produce an RPC request on cancel", () => {
    let state = getInitialExerciseSubstitutionDialogState(source, [compatibleTarget]);
    state = applyState(state, { type: "selectTarget", targetId: compatibleTarget.id });
    const result = exerciseSubstitutionDialogReducer(state, { type: "cancel" });

    expect(result.type).toBe("cancel");
    if (result.type !== "cancel") throw new Error("expected cancel result");
    expect(result.state.open).toBe(false);
    expect(result.state.targetId).toBeNull();
    expect(result.state.scope).toBe("current_workout");
    expect(result.state.saving).toBe(false);
    expect(result.state.error).toBeNull();
  });

  it("confirm returns precise source, target and scope", () => {
    let state = getInitialExerciseSubstitutionDialogState(source, [compatibleTarget]);
    state = applyState(state, { type: "selectTarget", targetId: compatibleTarget.id });
    state = applyState(state, { type: "selectScope", scope: "remaining_program" });
    const result = exerciseSubstitutionDialogReducer(state, { type: "confirm" });

    expect(result).toEqual({
      scope: "remaining_program",
      source,
      target: compatibleTarget,
      type: "confirm"
    });
  });

  it("prevents confirm while saving", () => {
    let state = getInitialExerciseSubstitutionDialogState(source, [compatibleTarget]);
    state = applyState(state, { type: "selectTarget", targetId: compatibleTarget.id });
    state = applyState(state, { type: "setSaving", saving: true });
    const result = exerciseSubstitutionDialogReducer(state, { type: "confirm" });

    expect(result).toEqual({ type: "idle", state });
  });

  it("prevents confirm without a selected target", () => {
    const state = getInitialExerciseSubstitutionDialogState(source, [compatibleTarget]);
    const result = exerciseSubstitutionDialogReducer(state, { type: "confirm" });

    expect(result).toEqual({ type: "idle", state });
  });

  it("preserves selection and scope when an error is set", () => {
    let state = getInitialExerciseSubstitutionDialogState(source, [compatibleTarget]);
    state = applyState(state, { type: "selectTarget", targetId: compatibleTarget.id });
    state = applyState(state, { type: "selectScope", scope: "remaining_program" });
    state = applyState(state, { type: "setSaving", saving: false });
    state = applyState(state, { type: "setError", error: "替换失败，请重试。" });

    expect(state.targetId).toBe(compatibleTarget.id);
    expect(state.scope).toBe("remaining_program");
    expect(state.error).toBe("替换失败，请重试。");
    expect(state.saving).toBe(false);
  });

  it("clears error when the target changes", () => {
    const secondTarget: SubstitutionCandidate = { ...compatibleTarget, id: "second-target", name: "第二目标" };
    let state = getInitialExerciseSubstitutionDialogState(source, [compatibleTarget, secondTarget]);
    state = applyState(state, { type: "selectTarget", targetId: compatibleTarget.id });
    state = applyState(state, { type: "setError", error: "替换失败，请重试。" });
    state = applyState(state, { type: "selectTarget", targetId: secondTarget.id });

    expect(state.error).toBeNull();
    expect(state.targetId).toBe(secondTarget.id);
  });
});
