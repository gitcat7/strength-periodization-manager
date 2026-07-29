import { describe, expect, it } from "vitest";
import { validatePlanSetup, validateProfileContext, type PlanSetupInput } from "./plan-setup";

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
  it("lets an existing-plan user save body context without a working-set entry", () => {
    const result = validateProfileContext({
      currentBodyWeightKg: "70",
      targetBodyWeightKg: "65",
      weightChangeLast14DaysKg: "-0.8",
      nutritionAdherence: "high",
      proteinTargetMet: true,
      recoveryStatus: "normal",
      weekCount: 12
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        currentBodyWeightKg: 70,
        targetWeightChangeKgPerWeek: -0.42
      }
    });
  });

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
  it("allows a beginner to generate a plan without a main-lift working set", () => {
    expect(validatePlanSetup(baseInput({ experienceLevel: "beginner", lifts: [] }))).toMatchObject({
      ok: true,
      value: { experienceLevel: "beginner", lifts: [] }
    });
  });

  it("requires a working set after six months of training", () => {
    expect(validatePlanSetup(baseInput({ experienceLevel: "novice", lifts: [] }))).toEqual({
      ok: false,
      fieldErrors: { lifts: "训练满 6 个月需要至少填写一个稳定完成的主项工作组" }
    });
  });

  it("requires training experience", () => {
    expect(validatePlanSetup(baseInput({ experienceLevel: "" as never, lifts: [] }))).toEqual({
      ok: false,
      fieldErrors: {
        experienceLevel: "请选择训练经验"
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
