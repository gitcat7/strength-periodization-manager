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

  it("uses the e1RM anchor and target reps while staying below training max", () => {
    const profile = {
      estimatedOneRepMax: 120,
      trainingMax: 107.5,
      workingWeight: 100,
      increment: 2.5
    };

    const fiveReps = resolvePrescriptionWeight({
      role: "primary", profile, relatedProfile: null, targetReps: 5, baseRatio: 1, increment: 2.5
    });
    const eightReps = resolvePrescriptionWeight({
      role: "primary", profile, relatedProfile: null, targetReps: 8, baseRatio: 1, increment: 2.5
    });

    expect(eightReps).toBeLessThan(fiveReps);
    expect(fiveReps).toBeLessThanOrEqual(profile.trainingMax);
    expect(fiveReps).toBeGreaterThan(80);
  });
});

describe("getPrescriptionPolicy", () => {
  it("gives intermediate hypertrophy more starting volume than beginner hypertrophy", () => {
    const beginner = getPrescriptionPolicy({ experienceLevel: "beginner", goal: "hypertrophy" });
    const novice = getPrescriptionPolicy({ experienceLevel: "novice", goal: "hypertrophy" });
    const intermediate = getPrescriptionPolicy({ experienceLevel: "intermediate", goal: "hypertrophy" });

    expect(novice.setsAdjustment).toBeGreaterThan(beginner.setsAdjustment);
    expect(intermediate.setsAdjustment).toBeGreaterThan(beginner.setsAdjustment);
    expect(beginner.progressionPercent).toBeLessThan(novice.progressionPercent);
    expect(novice.progressionPercent).toBeLessThan(intermediate.progressionPercent);
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
