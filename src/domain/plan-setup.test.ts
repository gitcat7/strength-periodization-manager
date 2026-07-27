import { describe, expect, it } from "vitest";
import { validatePlanSetup, type PlanSetupInput } from "./plan-setup";

function baseInput(overrides: Partial<PlanSetupInput> = {}): PlanSetupInput {
  return {
    experienceLevel: "beginner",
    goal: "strength",
    injuryNotes: "",
    lifts: [{ exerciseId: "bench", weightKg: "80", reps: "5" }],
    weekCount: 4,
    trainingDaysPerWeek: 3,
    ...overrides
  };
}

describe("validatePlanSetup", () => {
  it("converts a target body weight into a weekly change using the selected plan duration", () => {
    const result = validatePlanSetup({
      experienceLevel: "novice",
      goal: "fat_loss",
      injuryNotes: "",
      lifts: [{ exerciseId: "bench", weightKg: "80", reps: "5" }],
      nutritionAdherence: "high",
      proteinTargetMet: true,
      recoveryStatus: "low",
      currentBodyWeightKg: "70",
      targetBodyWeightKg: "65",
      weightChangeLast14DaysKg: "-0.8",
      weekCount: 12,
      trainingDaysPerWeek: 3
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        nutritionAdherence: "high",
        proteinTargetMet: true,
        recoveryStatus: "low",
        currentBodyWeightKg: 70,
        targetBodyWeightKg: 65,
        targetWeightChangeKgPerWeek: -0.42,
        weightChangeLast14DaysKg: -0.8
      }
    });
  });
  it("requires training experience and one positive main-lift working set", () => {
    expect(validatePlanSetup(baseInput({ experienceLevel: "" as never, lifts: [] }))).toEqual({
      ok: false,
      fieldErrors: {
        experienceLevel: "请选择训练经验",
        lifts: "至少录入一个主项最近工作组"
      }
    });
  });

  it("normalizes kg/reps into a safe lift profile payload", () => {
    expect(validatePlanSetup(baseInput())).toMatchObject({
      ok: true,
      value: { lifts: [{ exerciseId: "bench", workingWeight: 80, reps: 5 }] }
    });
  });

  it("accepts fat loss and removes retired scheduling fields from the plan payload", () => {
    const result = validatePlanSetup(baseInput({ goal: "fat_loss" as never, injuryNotes: "  右肩不适  " }));
    expect(result).toMatchObject({
      ok: true,
      value: { goal: "fat_loss", injuryNotes: "右肩不适" }
    });
    if (result.ok) {
      expect(result.value).not.toHaveProperty("availableWeekdays");
      expect(result.value).not.toHaveProperty("sessionDurationMinutes");
    }
  });

  it("accepts the combined hypertrophy_strength goal", () => {
    const result = validatePlanSetup(baseInput({ goal: "hypertrophy_strength" as never }));
    expect(result).toMatchObject({
      ok: true,
      value: { goal: "hypertrophy_strength" }
    });
  });

  it("rejects a plan period longer than twelve weeks", () => {
    expect(validatePlanSetup(baseInput({ weekCount: 13 }))).toEqual({
      ok: false,
      fieldErrors: { weekCount: "计划周期应为 1-12 周" }
    });
  });
});
