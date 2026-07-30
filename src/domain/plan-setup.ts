export type PlanExperienceLevel = "beginner" | "novice" | "intermediate";
export type PlanGoal = "hypertrophy" | "hypertrophy_strength" | "fat_loss" | "body_recomposition" | "strength";

export const sessionDurationOptions = [45, 60, 75, 90, 120, 150, 180] as const;
export type SessionDurationMinutes = (typeof sessionDurationOptions)[number];

export type PlanSetupInput = {
  experienceLevel: PlanExperienceLevel | "";
  goal: PlanGoal;
  injuryNotes: string;
  lifts: Array<{ exerciseId: string; weightKg: string; reps: string }>;
  weekCount: number;
  sessionDurationMinutes: SessionDurationMinutes;
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

  if (!isSessionDuration(input.sessionDurationMinutes)) {
    fieldErrors.sessionDurationMinutes = "单次训练时长应为 45–180 分钟的可选档位";
  }

  if (!Number.isInteger(input.weekCount) || input.weekCount < 1 || input.weekCount > 12) {
    fieldErrors.weekCount = "计划周期应为 1-12 周";
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
      weekCount: input.weekCount,
      sessionDurationMinutes: input.sessionDurationMinutes
    }
  };
}

function isSessionDuration(value: number): value is SessionDurationMinutes {
  return (sessionDurationOptions as readonly number[]).includes(value);
}

function isPlanExperienceLevel(value: PlanSetupInput["experienceLevel"]): value is PlanExperienceLevel {
  return value === "beginner" || value === "novice" || value === "intermediate";
}
