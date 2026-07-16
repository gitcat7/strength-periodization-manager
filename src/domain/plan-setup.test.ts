import { describe, expect, it } from "vitest";
import { validatePlanSetup, type PlanSetupInput } from "./plan-setup";

function baseInput(overrides: Partial<PlanSetupInput> = {}): PlanSetupInput {
  return {
    availableWeekdays: [1, 3, 5],
    experienceLevel: "beginner",
    goal: "strength",
    injuryNotes: "",
    lifts: [{ exerciseId: "bench", weightKg: "80", reps: "5" }],
    sessionDurationMinutes: 60,
    trainingDaysPerWeek: 3,
    ...overrides
  };
}

describe("validatePlanSetup", () => {
  it("requires a valid schedule and one positive main-lift working set", () => {
    expect(validatePlanSetup(baseInput({ availableWeekdays: [], lifts: [] }))).toEqual({
      ok: false,
      fieldErrors: {
        availableWeekdays: "请选择可训练日",
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

  it("deduplicates weekdays and trims optional injury notes", () => {
    expect(validatePlanSetup(baseInput({ availableWeekdays: [5, 1, 3, 1], injuryNotes: "  右肩不适  " }))).toMatchObject({
      ok: true,
      value: { availableWeekdays: [1, 3, 5], injuryNotes: "右肩不适" }
    });
  });
});
