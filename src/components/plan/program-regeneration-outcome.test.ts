import { describe, expect, it } from "vitest";

import { resolveProgramRegenerationOutcome } from "./program-regeneration-outcome";

describe("resolveProgramRegenerationOutcome", () => {
  it("keeps a recoverable dialog and clears stale plan state when the replacement succeeds but the fresh load fails", () => {
    expect(
      resolveProgramRegenerationOutcome({
        freshProgramLoaded: false,
        replacementSucceeded: true
      })
    ).toEqual({
      clearPendingPayload: true,
      dialogAction: "reloadFailed",
      dialogMessage: "新计划已生成，但无法加载最新日程。请刷新页面后再继续训练。",
      focusScheduleRow: false,
      message: "新计划已生成，但无法加载最新日程。请刷新页面后再继续训练，当前显示的旧日程已不再有效。",
      staleData: {
        program: null,
        recommendationWeights: {},
        recommendations: [],
        workoutExercises: [],
        workouts: []
      },
      type: "reloadFailed"
    });
  });
});
