export type PlanExperienceLevel = "beginner" | "novice" | "intermediate";
export type PlanGoal = "strength" | "hypertrophy_strength";

export type PlanSetupInput = {
  availableWeekdays: number[];
  experienceLevel: PlanExperienceLevel;
  goal: PlanGoal;
  injuryNotes: string;
  lifts: Array<{ exerciseId: string; weightKg: string; reps: string }>;
  sessionDurationMinutes: number;
  trainingDaysPerWeek: number;
};

export type ValidatedPlanSetup = Omit<PlanSetupInput, "lifts"> & {
  lifts: Array<{ exerciseId: string; workingWeight: number; reps: number }>;
};

export type PlanSetupValidationResult =
  | { ok: true; value: ValidatedPlanSetup }
  | { ok: false; fieldErrors: Record<string, string> };

const sessionDurationOptions = new Set([45, 60, 75, 90]);

export function validatePlanSetup(input: PlanSetupInput): PlanSetupValidationResult {
  const fieldErrors: Record<string, string> = {};
  const availableWeekdays = [...new Set(input.availableWeekdays)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((left, right) => left - right);
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

  if (availableWeekdays.length === 0) {
    fieldErrors.availableWeekdays = "请选择可训练日";
  } else if (availableWeekdays.length !== input.trainingDaysPerWeek) {
    fieldErrors.availableWeekdays = "可训练日数量需与每周训练天数一致";
  }

  if (!sessionDurationOptions.has(input.sessionDurationMinutes)) {
    fieldErrors.sessionDurationMinutes = "请选择单次训练时长";
  }

  if (lifts.length === 0) {
    fieldErrors.lifts = "至少录入一个主项最近工作组";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    value: {
      ...input,
      availableWeekdays,
      injuryNotes: input.injuryNotes.trim().slice(0, 500),
      lifts
    }
  };
}
