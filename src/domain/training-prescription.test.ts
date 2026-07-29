import { describe, expect, it } from "vitest";
import { getPrescriptionPolicy, resolvePrescriptionWeight } from "./training-prescription";

describe("resolvePrescriptionWeight", () => {
  it("keeps accessory weights independent from main-lift strength", () => {
    const lateralRaise = { increment: 1, workingWeight: 8 };
    const strongerBench = { estimatedOneRepMax: 180, increment: 2.5, workingWeight: 150 };

    expect(resolvePrescriptionWeight({
      role: "accessory",
      profile: lateralRaise,
      relatedProfile: strongerBench,
      targetReps: 15,
      baseRatio: 0.3,
      increment: 1
    })).toBe(8);
  });

  it("uses a zero prescription for bodyweight movements", () => {
    expect(resolvePrescriptionWeight({
      role: "bodyweight",
      profile: null,
      relatedProfile: null,
      targetReps: 8,
      baseRatio: 1,
      increment: 2.5
    })).toBe(0);
  });
});

describe("getPrescriptionPolicy", () => {
  it("gives intermediate hypertrophy more starting volume than beginner hypertrophy", () => {
    const beginner = getPrescriptionPolicy({ experienceLevel: "beginner", goal: "hypertrophy" });
    const intermediate = getPrescriptionPolicy({ experienceLevel: "intermediate", goal: "hypertrophy" });

    expect(intermediate.setsAdjustment).toBeGreaterThan(beginner.setsAdjustment);
  });

  it("never increases volume when recovery and energy availability are constrained", () => {
    const sustainable = getPrescriptionPolicy({
      experienceLevel: "novice",
      goal: "fat_loss",
      nutritionAdherence: "high",
      proteinTargetMet: true,
      recoveryStatus: "normal",
      currentBodyWeightKg: 80,
      targetWeightChangeKgPerWeek: -0.3,
      weightChangeLast14DaysKg: -0.6
    });
    const highStrain = getPrescriptionPolicy({
      experienceLevel: "novice",
      goal: "fat_loss",
      nutritionAdherence: "low",
      proteinTargetMet: false,
      recoveryStatus: "low",
      currentBodyWeightKg: 80,
      targetWeightChangeKgPerWeek: -0.8,
      weightChangeLast14DaysKg: -1.6
    });

    expect(highStrain.setsAdjustment).toBeLessThanOrEqual(sustainable.setsAdjustment);
  });
});
