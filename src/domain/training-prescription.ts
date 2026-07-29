import { roundToNearestPlate } from "./strength";

export type PrescriptionRole = "primary" | "secondary" | "accessory" | "bodyweight";

export type PrescriptionProfile = {
  estimatedOneRepMax?: number;
  increment: number;
  workingWeight: number;
};

export function getPrescriptionRole(slug: string): PrescriptionRole {
  if (slug === "pull_up" || slug === "cardio_zone2") return "bodyweight";
  if (["bench_press", "back_squat", "deadlift", "overhead_press"].includes(slug)) return "primary";
  if (["incline_dumbbell_press", "romanian_deadlift", "leg_press", "barbell_row", "lat_pulldown", "seated_cable_row"].includes(slug)) return "secondary";
  return "accessory";
}

export function getRelatedPrimarySlug(slug: string) {
  if (["incline_dumbbell_press"].includes(slug)) return "bench_press";
  if (["romanian_deadlift"].includes(slug)) return "deadlift";
  if (["leg_press"].includes(slug)) return "back_squat";
  if (["barbell_row", "lat_pulldown", "seated_cable_row"].includes(slug)) return "deadlift";
  return slug;
}

type PlanGoal = "strength" | "hypertrophy" | "hypertrophy_strength" | "fat_loss" | "body_recomposition";
type ExperienceLevel = "beginner" | "novice" | "intermediate";

export function getPrescriptionPolicy({
  goal,
  experienceLevel,
  nutritionAdherence = "moderate",
  proteinTargetMet = false,
  recoveryStatus = "normal",
  currentBodyWeightKg = null,
  targetWeightChangeKgPerWeek = null,
  weightChangeLast14DaysKg = null
}: {
  goal: PlanGoal;
  experienceLevel: ExperienceLevel;
  nutritionAdherence?: "low" | "moderate" | "high";
  proteinTargetMet?: boolean;
  recoveryStatus?: "low" | "normal" | "high";
  currentBodyWeightKg?: number | null;
  targetWeightChangeKgPerWeek?: number | null;
  weightChangeLast14DaysKg?: number | null;
}) {
  const goalSets = {
    strength: 1,
    hypertrophy: 1,
    hypertrophy_strength: 1,
    fat_loss: -1,
    body_recomposition: 0
  }[goal];
  const experienceSets = { beginner: -1, novice: 0, intermediate: 0 }[experienceLevel];
  const recoverySets = recoveryStatus === "low" ? -1 : 0;
  const targetRate = currentBodyWeightKg && targetWeightChangeKgPerWeek
    ? Math.abs(targetWeightChangeKgPerWeek / currentBodyWeightKg)
    : 0;
  const actualRate = currentBodyWeightKg && weightChangeLast14DaysKg
    ? Math.abs(weightChangeLast14DaysKg / 2 / currentBodyWeightKg)
    : 0;
  const energyRisk = (goal === "fat_loss" || goal === "body_recomposition")
    && (targetRate >= 0.0075 || actualRate >= 0.0075)
    && (nutritionAdherence === "low" || !proteinTargetMet);

  return {
    setsAdjustment: goalSets + experienceSets + recoverySets + (energyRisk ? -1 : 0),
    primaryRepAdjustment: goal === "hypertrophy" ? 3 : goal === "hypertrophy_strength" ? 1 : goal === "fat_loss" || goal === "body_recomposition" ? 2 : 0,
    secondaryRepAdjustment: goal === "hypertrophy" || goal === "hypertrophy_strength" || goal === "fat_loss" || goal === "body_recomposition" ? 1 : 0,
    loadAdjustment: {
      strength: 0.025,
      hypertrophy: -0.075,
      hypertrophy_strength: -0.025,
      fat_loss: -0.1,
      body_recomposition: -0.05
    }[goal] + { beginner: -0.05, novice: -0.025, intermediate: 0 }[experienceLevel]
  };
}

export function resolvePrescriptionWeight({
  role,
  profile,
  relatedProfile,
  targetReps,
  baseRatio,
  increment
}: {
  role: PrescriptionRole;
  profile: PrescriptionProfile | null;
  relatedProfile: PrescriptionProfile | null;
  targetReps: number;
  baseRatio: number;
  increment: number;
}) {
  if (role === "bodyweight") return 0;
  if (role === "accessory") {
    return profile ? roundToNearestPlate(profile.workingWeight, increment) : 0;
  }

  const anchor = role === "primary" ? profile : relatedProfile;
  if (!anchor) return 0;

  return roundToNearestPlate(anchor.workingWeight * baseRatio, increment);
}
