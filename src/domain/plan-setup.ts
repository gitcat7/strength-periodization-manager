export type PlanExperienceLevel = "beginner" | "novice" | "intermediate";
export type PlanGoal = "hypertrophy" | "fat_loss" | "body_recomposition" | "strength";

export type PlanSetupInput = {
  experienceLevel: PlanExperienceLevel | "";
  goal: PlanGoal;
  injuryNotes: string;
  lifts: Array<{ exerciseId: string; weightKg: string; reps: string }>;
  trainingDaysPerWeek: number;
};

export type ValidatedPlanSetup = Omit<PlanSetupInput, "experienceLevel" | "lifts"> & {
  experienceLevel: PlanExperienceLevel;
  lifts: Array<{ exerciseId: string; workingWeight: number; reps: number }>;
};

export type PlanSetupValidationResult =
  | { ok: true; value: ValidatedPlanSetup }
  | { ok: false; fieldErrors: Record<string, string> };

export function validatePlanSetup(input: PlanSetupInput): PlanSetupValidationResult {
  const fieldErrors: Record<string, string> = {};
  const experienceLevel = isPlanExperienceLevel(input.experienceLevel) ? input.experienceLevel : null;
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

  if (!experienceLevel) {
    fieldErrors.experienceLevel = "请选择训练经验";
  }

  if (lifts.length === 0) {
    fieldErrors.lifts = "至少录入一个主项最近工作组";
  }

  if (Object.keys(fieldErrors).length > 0 || !experienceLevel) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    value: {
      experienceLevel,
      goal: input.goal,
      injuryNotes: input.injuryNotes.trim().slice(0, 500),
      lifts,
      trainingDaysPerWeek: input.trainingDaysPerWeek
    }
  };
}

function isPlanExperienceLevel(value: PlanSetupInput["experienceLevel"]): value is PlanExperienceLevel {
  return value === "beginner" || value === "novice" || value === "intermediate";
}
