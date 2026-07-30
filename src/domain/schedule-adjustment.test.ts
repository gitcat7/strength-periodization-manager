import { describe, expect, it } from "vitest";

import * as scheduleAdjustment from "./schedule-adjustment";
import { buildResumePreview, getRecoveryLoadAdvice, type PendingTraining } from "./schedule-adjustment";

function pendingFromCycle(cycleIndex: number, positions: number[], scheduledDate = "2026-08-18"): PendingTraining[] {
  return positions.map((position) => ({
    sequenceIndex: cycleIndex * 6 + position,
    name: `第 ${cycleIndex * 6 + position + 1} 节`,
    scheduledDate
  }));
}

describe("getRecoveryLoadAdvice", () => {
  it("keeps full load after a short interruption", () => {
    expect(getRecoveryLoadAdvice(2)).toMatchObject({ multiplier: 1, suppressIncreases: false });
    expect(getRecoveryLoadAdvice(3)).toMatchObject({ multiplier: 1, suppressIncreases: false });
  });

  it("suggests a conservative reduction after a week away", () => {
    expect(getRecoveryLoadAdvice(7)).toMatchObject({ multiplier: 0.925, suppressIncreases: false });
    expect(getRecoveryLoadAdvice(13)).toMatchObject({ multiplier: 0.925, suppressIncreases: false });
  });

  it("suppresses load increases after a long interruption", () => {
    expect(getRecoveryLoadAdvice(21)).toMatchObject({ multiplier: 0.85, suppressIncreases: true });
    expect(getRecoveryLoadAdvice(14)).toMatchObject({ multiplier: 0.85, suppressIncreases: true });
  });

  it("always carries a title and message for rendering", () => {
    for (const days of [0, 7, 21]) {
      const advice = getRecoveryLoadAdvice(days);
      expect(advice.title.length).toBeGreaterThan(0);
      expect(advice.message.length).toBeGreaterThan(0);
    }
  });
});

describe("buildResumePreview", () => {
  it("skips only the current cycle pending training when starting the next cycle", () => {
    const preview = buildResumePreview({
      route: "start_next_cycle",
      templateLength: 6,
      resumedOn: "2026-08-20",
      pendingTraining: pendingFromCycle(2, [3, 4, 5])
    });

    expect(preview.skippedSequenceIndexes).toEqual([15, 16, 17]);
    expect(preview.skippedWorkoutNames).toEqual(["第 16 节", "第 17 节", "第 18 节"]);
    expect(preview.nextSequenceIndex).toBe(18);
    expect(preview.routeLabel).toBe("从下个循环第一节开始");
    expect(preview.nextDirection).toBe("第 4 循环第 1 节");
    expect(preview.dateDeltaDays).toBe(2);
  });

  it("skips no training when continuing the current cycle", () => {
    const preview = buildResumePreview({
      route: "continue_current_cycle",
      templateLength: 6,
      resumedOn: "2026-08-20",
      pendingTraining: pendingFromCycle(2, [3, 4, 5])
    });

    expect(preview.skippedSequenceIndexes).toEqual([]);
    expect(preview.nextSequenceIndex).toBe(15);
    expect(preview.nextWorkoutName).toBe("第 16 节");
    expect(preview.nextDirection).toBe("第 3 循环第 4 节");
  });

  it("handles an empty pending list without a next workout", () => {
    const preview = buildResumePreview({
      route: "continue_current_cycle",
      templateLength: 6,
      resumedOn: "2026-08-20",
      pendingTraining: []
    });

    expect(preview.nextSequenceIndex).toBeNull();
    expect(preview.nextWorkoutName).toBeNull();
    expect(preview.dateDeltaDays).toBe(0);
  });

  it("does not expose a default route", () => {
    expect("defaultRoute" in scheduleAdjustment).toBe(false);
  });
});
