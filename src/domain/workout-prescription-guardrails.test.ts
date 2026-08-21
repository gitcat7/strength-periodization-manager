import { describe, expect, test } from "vitest";

import { assessWorkoutPrescription } from "@/domain/workout-prescription-guardrails";

const pushMain = { id: "bench", trainingDirection: "push" as const, isMainLift: true };
const pushAccessory = { id: "triceps", trainingDirection: "push" as const, isMainLift: false };

describe("assessWorkoutPrescription", () => {
  test("blocks duplicate actions and a missing structured direction", () => {
    const result = assessWorkoutPrescription({
      direction: "push",
      currentHasMainLift: true,
      exercises: [
        { exercise: pushMain, targetSets: 3, targetReps: 5, targetWeight: 80 },
        { exercise: { ...pushAccessory, trainingDirection: null }, targetSets: 3, targetReps: 10, targetWeight: 20 },
        { exercise: pushMain, targetSets: 2, targetReps: 8, targetWeight: 70 }
      ]
    });

    expect(result.canSave).toBe(false);
    expect(result.blockers).toContain("动作不能重复。");
    expect(result.blockers).toContain("每个动作都需要结构化训练方向，请先修正动作资料。");
  });

  test("blocks mixing a heavy main lift from another direction", () => {
    const result = assessWorkoutPrescription({
      direction: "push",
      currentHasMainLift: true,
      exercises: [{ exercise: { id: "squat", trainingDirection: "squat", isMainLift: true }, targetSets: 3, targetReps: 5, targetWeight: 100 }]
    });

    expect(result.canSave).toBe(false);
    expect(result.blockers).toContain("动作方向与当天训练方向不兼容。");
  });

  test("blocks deleting the only main lift", () => {
    const result = assessWorkoutPrescription({
      direction: "push",
      currentHasMainLift: true,
      exercises: [{ exercise: pushAccessory, targetSets: 3, targetReps: 10, targetWeight: 20 }]
    });

    expect(result.canSave).toBe(false);
    expect(result.blockers).toContain("主项不能直接删除，请先添加同方向主项替代。");
  });

  test("requires confirmation for unusual volume or multiple main lifts without blocking a valid draft", () => {
    const result = assessWorkoutPrescription({
      direction: "push",
      currentHasMainLift: true,
      weeklySetsAfterSave: 34,
      exercises: [
        { exercise: pushMain, targetSets: 4, targetReps: 5, targetWeight: 80 },
        { exercise: { id: "press", trainingDirection: "push", isMainLift: true }, targetSets: 4, targetReps: 6, targetWeight: 50 }
      ]
    });

    expect(result.canSave).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.warnings).toContain("本周有效组数明显偏高或偏低，请确认恢复与训练经验。");
    expect(result.warnings).toContain("同日重主项较多，请确认恢复安排。");
  });
});
