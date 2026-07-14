import { describe, expect, it } from "vitest";

import {
  exerciseSubstitutionDialogReducer,
  getInitialExerciseSubstitutionDialogState,
  getSubstitutionDraftCleanupWarning,
  getSubstitutionOutcome,
  getSubstitutionConfirmResult,
  getSubstitutionErrorMessage,
  getUnknownErrorMessage,
  parseSubstitutionRpcResponse,
  type SubstitutionCandidate
} from "./exercise-substitution-dialog-state";

const source: SubstitutionCandidate = {
  catalogExternalId: "0334",
  id: "source-exercise",
  movementPattern: "shoulder_abduction",
  name: "侧平举",
  substitutionEnabled: true,
  trainingDirection: "push",
  workoutExerciseId: "we-source"
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
  return exerciseSubstitutionDialogReducer(state, action);
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

    expect(result.open).toBe(false);
    expect(result.targetId).toBeNull();
    expect(result.scope).toBe("current_workout");
    expect(result.saving).toBe(false);
    expect(result.error).toBeNull();
  });

  it("confirm returns precise source, target and scope via getSubstitutionConfirmResult", () => {
    let state = getInitialExerciseSubstitutionDialogState(source, [compatibleTarget]);
    state = applyState(state, { type: "selectTarget", targetId: compatibleTarget.id });
    state = applyState(state, { type: "selectScope", scope: "remaining_program" });
    const result = getSubstitutionConfirmResult(state);

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
    const result = getSubstitutionConfirmResult(state);

    expect(result).toBeNull();
  });

  it("prevents confirm without a selected target", () => {
    const state = getInitialExerciseSubstitutionDialogState(source, [compatibleTarget]);
    const result = getSubstitutionConfirmResult(state);

    expect(result).toBeNull();
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

  it("rejects cancel while saving", () => {
    let state = getInitialExerciseSubstitutionDialogState(source, [compatibleTarget]);
    state = applyState(state, { type: "setSaving", saving: true });
    const result = exerciseSubstitutionDialogReducer(state, { type: "cancel" });

    expect(result.open).toBe(true);
    expect(result.saving).toBe(true);
  });

  it("open resets state for a new source", () => {
    const newSource: SubstitutionCandidate = { ...source, id: "new-source", name: "新动作" };
    let state = getInitialExerciseSubstitutionDialogState(source, [compatibleTarget]);
    state = applyState(state, { type: "selectTarget", targetId: compatibleTarget.id });
    state = applyState(state, { type: "selectScope", scope: "remaining_program" });
    state = applyState(state, { type: "setError", error: "some error" });
    state = applyState(state, { type: "open", source: newSource, alternatives: [compatibleTarget] });

    expect(state.open).toBe(true);
    expect(state.source).toEqual(newSource);
    expect(state.targetId).toBeNull();
    expect(state.scope).toBe("current_workout");
    expect(state.error).toBeNull();
    expect(state.saving).toBe(false);
  });

  it("reset closes dialog and clears selection", () => {
    let state = getInitialExerciseSubstitutionDialogState(source, [compatibleTarget]);
    state = applyState(state, { type: "selectTarget", targetId: compatibleTarget.id });
    state = applyState(state, { type: "selectScope", scope: "remaining_program" });
    const result = exerciseSubstitutionDialogReducer(state, { type: "reset" });

    expect(result.open).toBe(false);
    expect(result.targetId).toBeNull();
    expect(result.scope).toBe("current_workout");
  });
});

describe("parseSubstitutionRpcResponse", () => {
  it("parses a valid single-row RPC response", () => {
    const result = parseSubstitutionRpcResponse({
      affected_count: 2,
      affected_ids: ["id-1", "id-2"]
    });

    expect(result).toEqual({
      affectedCount: 2,
      affectedIds: ["id-1", "id-2"]
    });
  });

  it("throws for an array response", () => {
    expect(() => parseSubstitutionRpcResponse([{ affected_count: 1, affected_ids: ["id-1"] }])).toThrow(
      "替换结果异常，请刷新页面后重试。"
    );
  });

  it("throws when fields are missing", () => {
    expect(() => parseSubstitutionRpcResponse({ affected_count: 1 })).toThrow(
      "替换结果异常，请刷新页面后重试。"
    );
  });

  it("throws when affected_count is negative", () => {
    expect(() =>
      parseSubstitutionRpcResponse({ affected_count: -1, affected_ids: ["id-1"] })
    ).toThrow("替换结果异常，请刷新页面后重试。");
  });

  it("throws when affected_count is not an integer", () => {
    expect(() =>
      parseSubstitutionRpcResponse({ affected_count: 1.5, affected_ids: ["id-1"] })
    ).toThrow("替换结果异常，请刷新页面后重试。");
  });

  it("throws when affected_count is not finite", () => {
    expect(() =>
      parseSubstitutionRpcResponse({ affected_count: Infinity, affected_ids: ["id-1"] })
    ).toThrow("替换结果异常，请刷新页面后重试。");
  });

  it("throws when affected_ids is empty", () => {
    expect(() =>
      parseSubstitutionRpcResponse({ affected_count: 0, affected_ids: [] })
    ).toThrow("替换结果异常，请刷新页面后重试。");
  });

  it("throws when affected_ids contains non-string values", () => {
    expect(() =>
      parseSubstitutionRpcResponse({ affected_count: 2, affected_ids: ["id-1", 123] })
    ).toThrow("替换结果异常，请刷新页面后重试。");
  });

  it("throws when affected_ids contains empty strings", () => {
    expect(() =>
      parseSubstitutionRpcResponse({ affected_count: 2, affected_ids: ["id-1", ""] })
    ).toThrow("替换结果异常，请刷新页面后重试。");
  });

  it("throws when count does not match ids length", () => {
    expect(() =>
      parseSubstitutionRpcResponse({ affected_count: 3, affected_ids: ["id-1", "id-2"] })
    ).toThrow("替换结果异常，请刷新页面后重试。");
  });

  it("throws when affected_count is zero but ids is non-empty", () => {
    expect(() =>
      parseSubstitutionRpcResponse({ affected_count: 0, affected_ids: ["id-1"] })
    ).toThrow("替换结果异常，请刷新页面后重试。");
  });
});

describe("getSubstitutionOutcome", () => {
  it("keeps an RPC error retryable", () => {
    expect(getSubstitutionOutcome(null, { code: "40P01" })).toEqual({
      type: "retryable_failure",
      error: "系统繁忙，请稍后再试。"
    });
  });

  it("returns committed_success for a valid response", () => {
    expect(
      getSubstitutionOutcome(
        { affected_count: 2, affected_ids: ["id-1", "id-2"] },
        null
      )
    ).toEqual({
      type: "committed_success",
      affectedCount: 2,
      affectedIds: ["id-1", "id-2"]
    });
  });

  it("does not make an invalid response retryable after the RPC committed", () => {
    expect(getSubstitutionOutcome({ affected_count: 1 }, null)).toEqual({
      type: "committed_unverified",
      warning: "替换已提交，但返回结果异常，本地草稿清理未完全确认，请刷新后核对。"
    });
  });
});

describe("getSubstitutionDraftCleanupWarning", () => {
  it("warns when either draft cleanup is unconfirmed", () => {
    expect(getSubstitutionDraftCleanupWarning(false, false, true)).toBe(
      "替换已成功，但本地草稿清理未完全确认。"
    );
    expect(getSubstitutionDraftCleanupWarning(false, true, false)).toBe(
      "替换已成功，但本地草稿清理未完全确认。"
    );
  });

  it("warns when the affected-workout lookup fails", () => {
    expect(getSubstitutionDraftCleanupWarning(true, true, true)).toBe(
      "替换已成功，但本地草稿清理未完全确认。"
    );
  });

  it("does not warn after fully confirmed cleanup", () => {
    expect(getSubstitutionDraftCleanupWarning(false, true, true)).toBeNull();
  });
});

describe("getSubstitutionErrorMessage", () => {
  it("maps RLS violation to a friendly Chinese message", () => {
    expect(getSubstitutionErrorMessage({ code: "42501", message: "permission denied" })).toBe(
      "权限不足，无法替换此动作。请确认当前训练属于您本人。"
    );
  });

  it("maps single-row mismatch to a friendly Chinese message", () => {
    expect(getSubstitutionErrorMessage({ code: "PGRST116", message: "no rows" })).toBe(
      "替换结果异常，请刷新页面后重试。"
    );
  });

  it("falls back to the error message for unknown codes", () => {
    const error = new Error("network failure");
    expect(getSubstitutionErrorMessage(error)).toBe("network failure");
  });

  it("falls back to a generic Chinese message for non-errors", () => {
    expect(getSubstitutionErrorMessage(null)).toBe("替换失败，请重试。");
  });
});

describe("getUnknownErrorMessage", () => {
  it("returns a stable Chinese message", () => {
    expect(getUnknownErrorMessage()).toBe("替换失败，请重试。");
  });
});
