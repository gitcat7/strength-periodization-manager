import { describe, expect, it } from "vitest";

import { buildExerciseCoachRecommendation, buildNextCycleMainLiftRecommendation, getRecommendationStatusLabel } from "./fitness-coach";

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

  it("does not increase when completed sets miss the planned weight", () => {
    expect(
      buildExerciseCoachRecommendation({
        exerciseName: "杠铃卧推",
        increment: 2.5,
        isMainLift: true,
        logs: [{ ...completedSet(7), actualWeight: 50, actualReps: 1 }, { ...completedSet(7), actualWeight: 50, actualReps: 1 }],
        targetWeight: 100
      })
    ).toMatchObject({ suggestedWeight: 100, type: "hold" });
  });

  it("does not increase when completed sets miss the planned repetitions", () => {
    expect(
      buildExerciseCoachRecommendation({
        exerciseName: "杠铃卧推",
        increment: 2.5,
        isMainLift: true,
        logs: [{ ...completedSet(7), actualReps: 4 }, { ...completedSet(7), actualReps: 4 }],
        targetWeight: 100
      })
    ).toMatchObject({ suggestedWeight: 100, type: "hold" });
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

describe("next-cycle main-lift recommendation", () => {
  const met = (rpe: number) => ({
    actualReps: 5,
    actualWeight: 100,
    completed: true,
    rpe,
    targetReps: 5,
    targetWeight: 100
  });

  it("increases only a well-completed main lift with low RPE", () => {
    expect(buildNextCycleMainLiftRecommendation({ exerciseName: "杠铃卧推", increment: 2.5, logs: [met(7), met(7)], targetWeight: 100, consecutiveMissedSessions: 0 }))
      .toMatchObject({ type: "increase", suggestedWeight: 102.5 });
  });

  it("deloads when completion is poor or consecutive sessions were missed", () => {
    expect(buildNextCycleMainLiftRecommendation({ exerciseName: "杠铃深蹲", increment: 2.5, logs: [{ ...met(9), completed: false }], targetWeight: 100, consecutiveMissedSessions: 0 }))
      .toMatchObject({ type: "deload", suggestedWeight: 90 });
    expect(buildNextCycleMainLiftRecommendation({ exerciseName: "杠铃硬拉", increment: 2.5, logs: [met(7)], targetWeight: 100, consecutiveMissedSessions: 2 }))
      .toMatchObject({ type: "deload", suggestedWeight: 90 });
  });

  it("holds when there is not enough real data", () => {
    expect(buildNextCycleMainLiftRecommendation({ exerciseName: "杠铃推举", increment: 2.5, logs: [], targetWeight: 60, consecutiveMissedSessions: 0 }))
      .toMatchObject({ type: "hold", suggestedWeight: 60, reason: "杠铃推举数据不足，保持当前处方。" });
  });
});
