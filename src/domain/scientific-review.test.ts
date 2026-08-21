import { describe, expect, it } from "vitest";

import { buildScientificReview } from "./scientific-review";

const completedSet = (rpe = 8) => ({
  actualReps: 5,
  actualWeight: 100,
  completed: true,
  rpe,
  targetReps: 5,
  targetWeight: 100
});

describe("buildScientificReview", () => {
  it("keeps the prescription when required performance data is missing", () => {
    expect(buildScientificReview({ increment: 2.5, isMainLift: true, logs: [], targetSets: 3, targetWeight: 100 }))
      .toMatchObject({ reasonCode: "insufficient_data", suggestedWeight: 100, type: "hold" });
  });

  it("never increases when completion is below target even with an easy RPE", () => {
    expect(buildScientificReview({
      increment: 2.5,
      isMainLift: true,
      logs: [completedSet(6), { ...completedSet(6), completed: false }],
      targetSets: 2,
      targetWeight: 100
    })).toMatchObject({ reasonCode: "incomplete_sets", suggestedWeight: 100, type: "hold" });
  });

  it("lets a high RPE protection condition override an otherwise completed main lift", () => {
    expect(buildScientificReview({
      increment: 2.5,
      isMainLift: true,
      logs: [completedSet(7), completedSet(9)],
      targetSets: 2,
      targetWeight: 100
    })).toMatchObject({ reasonCode: "high_rpe", suggestedWeight: 95, type: "decrease" });
  });

  it("deloads after an abnormal training interval before considering progression", () => {
    expect(buildScientificReview({
      daysSincePreviousTraining: 15,
      increment: 2.5,
      isMainLift: true,
      logs: [completedSet(7), completedSet(7), completedSet(7)],
      targetSets: 3,
      targetWeight: 100
    })).toMatchObject({ advice: "recovery", reasonCode: "long_interruption", suggestedSets: 2, type: "deload" });
  });

  it("does not increase a completed lift when recovery is reported poor", () => {
    expect(buildScientificReview({
      increment: 2.5,
      isMainLift: true,
      logs: [completedSet(7), completedSet(7), completedSet(7)],
      recovery: "poor",
      targetSets: 3,
      targetWeight: 100
    })).toMatchObject({ advice: "recovery", reasonCode: "recovery_caution", type: "deload" });
  });

  it("only advances a complete main lift with normal recovery and an RPE at or below eight", () => {
    expect(buildScientificReview({
      daysSincePreviousTraining: 3,
      increment: 2.5,
      isMainLift: true,
      logs: [completedSet(7), completedSet(8), completedSet(8)],
      recovery: "normal",
      targetSets: 3,
      targetWeight: 100
    })).toMatchObject({ reasonCode: "progression_ready", suggestedWeight: 102.5, type: "increase" });
  });

  it("holds a non-main lift despite low RPE", () => {
    expect(buildScientificReview({
      increment: 1,
      isMainLift: false,
      logs: [completedSet(6), completedSet(6)],
      targetSets: 2,
      targetWeight: 20
    })).toMatchObject({ reasonCode: "accessory_observe", suggestedWeight: 20, type: "hold" });
  });
});
