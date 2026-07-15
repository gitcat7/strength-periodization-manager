import { describe, expect, it } from "vitest";

import {
  buildConfirmationPayload,
  createRegenerationDialogState,
  reduceRegenerationDialog,
  type RegenerationSelection
} from "./program-regeneration-dialog-state";

const preview = {
  endDate: "2026-08-09",
  restDays: 16,
  trainingDays: 12,
  unfinishedRestDays: 2,
  unfinishedTrainingDays: 3
};

const selection: RegenerationSelection = {
  payload: {
    schedule_items: Array.from({ length: 28 }, (_, scheduleIndex) => ({ schedule_index: scheduleIndex }))
  },
  scheduleLabel: "练 1 天，休 1 天",
  templateLabel: "推拉蹲"
};

describe("regeneration dialog state", () => {
  it("does not create mutation data before confirmation", () => {
    let state = createRegenerationDialogState();
    state = reduceRegenerationDialog(state, { type: "open", preview, selection });

    expect(state.open).toBe(true);
    expect(buildConfirmationPayload(state)).toBeNull();

    state = reduceRegenerationDialog(state, { type: "confirm" });
    expect(buildConfirmationPayload(state)?.schedule_items).toHaveLength(28);
  });

  it("clears the preview and selection when cancelled", () => {
    let state = reduceRegenerationDialog(createRegenerationDialogState(), {
      type: "open",
      preview,
      selection
    });
    state = reduceRegenerationDialog(state, { type: "close" });

    expect(state).toEqual(createRegenerationDialogState());
  });

  it("retains the preview and selection after a failed request", () => {
    let state = reduceRegenerationDialog(createRegenerationDialogState(), {
      type: "open",
      preview,
      selection
    });
    state = reduceRegenerationDialog(state, { type: "confirm" });
    state = reduceRegenerationDialog(state, { type: "requestFailed", message: "请稍后重试。" });

    expect(state).toMatchObject({ open: true, phase: "preview", preview, selection });
    expect(state.error).toBe("请稍后重试。");
  });

  it("ignores a duplicate confirm while a request is submitting", () => {
    let state = reduceRegenerationDialog(createRegenerationDialogState(), {
      type: "open",
      preview,
      selection
    });
    state = reduceRegenerationDialog(state, { type: "confirm" });
    const duplicate = reduceRegenerationDialog(state, { type: "confirm" });

    expect(duplicate).toBe(state);
    expect(duplicate.phase).toBe("submitting");
  });
});
