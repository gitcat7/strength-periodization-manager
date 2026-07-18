import { describe, expect, it } from "vitest";

import { buildExerciseCoachRecommendation, getRecommendationStatusLabel } from "./fitness-coach";

describe("exercise coach recommendation safety gate", () => {
  const completedSet = (rpe: number | null) => ({
    actualReps: 5,
    actualWeight: 100,
    completed: true,
    rpe,
    targetReps: 5,
    targetWeight: 100
  });

  it("increases a completed main lift when the final real RPE is 8 or lower", () => {
    expect(
      buildExerciseCoachRecommendation({
        exerciseName: "杠铃卧推",
        increment: 2.5,
        isMainLift: true,
        logs: [completedSet(7), completedSet(8)],
        targetWeight: 100
      })
    ).toMatchObject({ suggestedWeight: 102.5, type: "increase" });
  });

  it("does not increase when a completed main lift finishes at RPE 9", () => {
    expect(
      buildExerciseCoachRecommendation({
        exerciseName: "杠铃卧推",
        increment: 2.5,
        isMainLift: true,
        logs: [completedSet(6), completedSet(6), completedSet(9)],
        targetWeight: 100
      })
    ).toMatchObject({ suggestedWeight: 100, type: "hold" });
  });

  it("does not increase when a completed main lift is missing its final RPE", () => {
    expect(
      buildExerciseCoachRecommendation({
        exerciseName: "杠铃卧推",
        increment: 2.5,
        isMainLift: true,
        logs: [completedSet(7), completedSet(null)],
        targetWeight: 100
      })
    ).not.toMatchObject({ type: "increase" });
  });

  it("does not increase a main lift with an invalid final RPE", () => {
    expect(
      buildExerciseCoachRecommendation({
        exerciseName: "杠铃卧推",
        increment: 2.5,
        isMainLift: true,
        logs: [completedSet(7), completedSet(11)],
        targetWeight: 100
      })
    ).toMatchObject({ suggestedWeight: 100, type: "hold" });
  });

  it("does not increase a main lift with an unfinished target set", () => {
    expect(
      buildExerciseCoachRecommendation({
        exerciseName: "杠铃卧推",
        increment: 2.5,
        isMainLift: true,
        logs: [completedSet(7), { ...completedSet(7), completed: false }],
        targetWeight: 100
      })
    ).not.toMatchObject({ type: "increase" });
  });

  it("never gives a default increase to a non-main lift", () => {
    expect(
      buildExerciseCoachRecommendation({
        exerciseName: "侧平举",
        increment: 1,
        isMainLift: false,
        logs: [completedSet(7), completedSet(7)],
        targetWeight: 10
      })
    ).toMatchObject({ suggestedWeight: 10, type: "hold" });
  });
});

describe("recommendation status copy", () => {
  it("only reports the next workout updated after an explicit acceptance", () => {
    expect(getRecommendationStatusLabel("pending")).toBe("待处理 · 尚未更新下次训练");
    expect(getRecommendationStatusLabel("rejected")).toBe("已忽略");
    expect(getRecommendationStatusLabel("accepted")).toBe("已更新下次训练");
    expect(getRecommendationStatusLabel("modified")).toBe("修改后已更新下次训练");
  });
});
