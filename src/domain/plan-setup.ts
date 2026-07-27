export type PlanExperienceLevel = "beginner" | "novice" | "intermediate";
export type PlanGoal = "hypertrophy" | "hypertrophy_strength" | "fat_loss" | "body_recomposition" | "strength";
export type NutritionAdherence = "low" | "moderate" | "high";
export type RecoveryStatus = "low" | "normal" | "high";

export type PlanSetupInput = {
  experienceLevel: PlanExperienceLevel | "";
  goal: PlanGoal;
  injuryNotes: string;
  lifts: Array<{ exerciseId: string; weightKg: string; reps: string }>;
  nutritionAdherence?: NutritionAdherence;
  proteinTargetMet?: boolean;
  recoveryStatus?: RecoveryStatus;
  currentBodyWeightKg?: string;
  targetBodyWeightKg?: string;
  weightChangeLast14DaysKg?: string;
  weekCount: number;
  trainingDaysPerWeek: number;
};

export type ProfileContextInput = Pick<PlanSetupInput,
  "nutritionAdherence" | "proteinTargetMet" | "recoveryStatus" | "currentBodyWeightKg" | "targetBodyWeightKg" | "weightChangeLast14DaysKg" | "weekCount"
>;

export type ValidatedProfileContext = {
  nutritionAdherence: NutritionAdherence;
  proteinTargetMet: boolean;
  recoveryStatus: RecoveryStatus;
  currentBodyWeightKg: number | null;
  targetBodyWeightKg: number | null;
  targetWeightChangeKgPerWeek: number | null;
  weightChangeLast14DaysKg: number | null;
};

export type ProfileContextValidationResult =
  | { ok: true; value: ValidatedProfileContext }
  | { ok: false; fieldErrors: Record<string, string> };

export type ValidatedPlanSetup = Omit<PlanSetupInput, "experienceLevel" | "lifts" | "nutritionAdherence" | "proteinTargetMet" | "recoveryStatus" | "currentBodyWeightKg" | "targetBodyWeightKg" | "weightChangeLast14DaysKg"> & {
  experienceLevel: PlanExperienceLevel;
  lifts: Array<{ exerciseId: string; workingWeight: number; reps: number }>;
  nutritionAdherence: NutritionAdherence;
  proteinTargetMet: boolean;
  recoveryStatus: RecoveryStatus;
  currentBodyWeightKg: number | null;
  targetBodyWeightKg: number | null;
  targetWeightChangeKgPerWeek: number | null;
  weightChangeLast14DaysKg: number | null;
};

export type PlanSetupValidationResult =
  | { ok: true; value: ValidatedPlanSetup }
  | { ok: false; fieldErrors: Record<string, string> };

export function validatePlanSetup(input: PlanSetupInput): PlanSetupValidationResult {
  const fieldErrors: Record<string, string> = {};
  const experienceLevel = isPlanExperienceLevel(input.experienceLevel) ? input.experienceLevel : null;
  const profileContext = validateProfileContext(input);
  const lifts = input.lifts.flatMap((lift) => {
    const workingWeight = Number(lift.weightKg);
    const reps = Number(lift.reps);

    return lift.exerciseId.trim() && Number.isFinite(workingWeight) && workingWeight > 0 && workingWeight <= 1000 && Number.isInteger(reps) && reps >= 1 && reps <= 30
      ? [{ exerciseId: lift.exerciseId, workingWeight, reps }]
      : [];
  });

  if (!Number.isInteger(input.trainingDaysPerWeek) || input.trainingDaysPerWeek < 1 || input.trainingDaysPerWeek > 7) {
    fieldErrors.trainingDaysPerWeek = "每周训练天数应为 1-7 天";
  }

  if (!Number.isInteger(input.weekCount) || input.weekCount < 1 || input.weekCount > 12) {
    fieldErrors.weekCount = "计划周期应为 1-12 周";
  }

  if (!experienceLevel) {
    fieldErrors.experienceLevel = "请选择训练经验";
  }

  if (!profileContext.ok) Object.assign(fieldErrors, profileContext.fieldErrors);

  if (lifts.length === 0) {
    fieldErrors.lifts = "至少录入一个主项最近工作组";
  }

  if (Object.keys(fieldErrors).length > 0 || !experienceLevel || !profileContext.ok) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    value: {
      experienceLevel,
      goal: input.goal,
      injuryNotes: input.injuryNotes.trim().slice(0, 500),
      lifts,
      ...profileContext.value,
      weekCount: input.weekCount,
      trainingDaysPerWeek: input.trainingDaysPerWeek
    }
  };
}

export function validateProfileContext(input: ProfileContextInput): ProfileContextValidationResult {
  const fieldErrors: Record<string, string> = {};
  const currentBodyWeightKg = parseOptionalNumber(input.currentBodyWeightKg ?? "", 30, 300);
  const targetBodyWeightKg = parseOptionalNumber(input.targetBodyWeightKg ?? "", 30, 300);
  const weightChangeLast14DaysKg = parseOptionalNumber(input.weightChangeLast14DaysKg ?? "", -3, 3);
  const hasCurrentBodyWeight = typeof currentBodyWeightKg === "number";
  const hasTargetBodyWeight = typeof targetBodyWeightKg === "number";
  const targetWeightChangeKgPerWeek = hasCurrentBodyWeight && hasTargetBodyWeight
    ? roundToTwoDecimals((targetBodyWeightKg - currentBodyWeightKg) / input.weekCount)
    : null;

  if (currentBodyWeightKg === undefined) {
    fieldErrors.currentBodyWeightKg = "当前体重应在 30 至 300 kg 之间";
  }
  if (targetBodyWeightKg === undefined) {
    fieldErrors.targetBodyWeightKg = "目标体重应在 30 至 300 kg 之间";
  }
  if (hasTargetBodyWeight && !hasCurrentBodyWeight) {
    fieldErrors.currentBodyWeightKg = "填写目标体重时，还需要填写当前体重";
  }
  if (targetWeightChangeKgPerWeek !== null && (targetWeightChangeKgPerWeek < -1.5 || targetWeightChangeKgPerWeek > 1)) {
    fieldErrors.targetBodyWeightKg = "按当前周期折算后，每周体重变化应在 -1.5 至 1 kg 之间";
  }
  if (weightChangeLast14DaysKg === undefined) {
    fieldErrors.weightChangeLast14DaysKg = "近 14 天体重变化应在 -3 至 3 kg 之间";
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    value: {
      nutritionAdherence: input.nutritionAdherence ?? "moderate",
      proteinTargetMet: input.proteinTargetMet ?? false,
      recoveryStatus: input.recoveryStatus ?? "normal",
      currentBodyWeightKg: currentBodyWeightKg ?? null,
      targetBodyWeightKg: targetBodyWeightKg ?? null,
      targetWeightChangeKgPerWeek,
      weightChangeLast14DaysKg: weightChangeLast14DaysKg ?? null
    }
  };
}

function isPlanExperienceLevel(value: PlanSetupInput["experienceLevel"]): value is PlanExperienceLevel {
  return value === "beginner" || value === "novice" || value === "intermediate";
}

function parseOptionalNumber(value: string, min: number, max: number) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}
