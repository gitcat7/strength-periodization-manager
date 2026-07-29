import { getPrescriptionPolicy, getPrescriptionRole, getRelatedPrimarySlug, resolvePrescriptionWeight } from "@/domain/training-prescription";

export type LegacyTemplateType = "three_day_full_body" | "four_day_upper_lower";
export type TemplateType =
  | LegacyTemplateType
  | "one_split"
  | "three_split"
  | "five_split"
  | "push_pull_squat";
export type ProgramTemplateType = TemplateType | "custom";

export type ScheduleMode = "fixed_weekdays" | "cadence" | "flexible";

export type ScheduleConfig =
  | { mode: "fixed_weekdays"; weekdays: number[] }
  | { mode: "cadence"; trainDays?: number; restDays: number }
  | { mode: "flexible" };

export type MovementRestriction =
  | "avoid_overhead_press"
  | "avoid_horizontal_push"
  | "avoid_deep_knee_flexion"
  | "avoid_deadlift_hip_hinge";

export const templateOptions: Array<{ description: string; label: string; value: TemplateType }> = [
  { value: "one_split", label: "一分化", description: "全身训练，适合每周 2-3 次稳定入门。" },
  { value: "three_split", label: "三分化", description: "胸肩三头 / 背二头 / 腿，按顺序循环。" },
  { value: "four_day_upper_lower", label: "上下肢四分化", description: "上肢 / 下肢交替，适合每周 4 次。" },
  { value: "five_split", label: "五分化", description: "胸 / 背 / 腿 / 肩 / 手臂，单日更聚焦。" },
  { value: "push_pull_squat", label: "推拉蹲", description: "推 / 拉 / 蹲 A/B，交替强度与容量。" }
];

export type ExerciseProfile = {
  slug: string;
  id: string;
  estimatedOneRepMax?: number;
  trainingMax?: number;
  workingWeight: number;
  increment: number;
};

export type PlanGoal = "strength" | "hypertrophy" | "hypertrophy_strength" | "fat_loss" | "body_recomposition";
export type ExperienceLevel = "beginner" | "novice" | "intermediate";
export type NutritionAdherence = "low" | "moderate" | "high";
export type RecoveryStatus = "low" | "normal" | "high";

export type PlannedWorkoutExercise = {
  exerciseSlug: string;
  targetSets: number;
  targetReps: number;
  targetWeight: number;
};

export type PlannedWorkout = {
  dayType: "training";
  exercises: PlannedWorkoutExercise[];
  name: string;
  scheduledDate: string;
  scheduleIndex: number;
  sequenceIndex: number;
};

export type PlannedRestDay = {
  dayType: "rest";
  exercises: [];
  name: "休息/恢复日";
  scheduledDate: string;
  scheduleIndex: number;
  sequenceIndex: null;
};

export type PlannedScheduleItem = PlannedWorkout | PlannedRestDay;

type PlannedTrainingWorkout = Omit<PlannedWorkout, "dayType" | "scheduleIndex">;

export function buildSchedulePreview(items: PlannedScheduleItem[]): {
  endDate: string;
  restDays: number;
  trainingDays: number;
} {
  return items.reduce(
    (preview, item) => ({
      endDate: item.scheduledDate,
      restDays: preview.restDays + (item.dayType === "rest" ? 1 : 0),
      trainingDays: preview.trainingDays + (item.dayType === "training" ? 1 : 0)
    }),
    { endDate: "", restDays: 0, trainingDays: 0 }
  );
}

function expandScheduleItems(
  trainingWorkouts: PlannedTrainingWorkout[],
  schedule: ScheduleConfig
): PlannedScheduleItem[] {
  if (schedule.mode === "flexible") {
    return trainingWorkouts.map((workout, scheduleIndex) => ({
      ...workout,
      dayType: "training",
      scheduleIndex
    }));
  }

  const workoutsByDate = new Map(trainingWorkouts.map((workout) => [workout.scheduledDate, workout]));
  const firstWorkout = trainingWorkouts[0];
  const lastWorkout = trainingWorkouts.at(-1);
  if (!firstWorkout || !lastWorkout) return [];

  const cursor = new Date(`${firstWorkout.scheduledDate}T00:00:00`);
  const lastDate = lastWorkout.scheduledDate;
  const items: PlannedScheduleItem[] = [];

  while (formatDate(cursor) <= lastDate) {
    const scheduledDate = formatDate(cursor);
    const workout = workoutsByDate.get(scheduledDate);

    items.push(
      workout
        ? { ...workout, dayType: "training", scheduleIndex: items.length }
        : {
            dayType: "rest",
            exercises: [],
            name: "休息/恢复日",
            scheduledDate,
            scheduleIndex: items.length,
            sequenceIndex: null
          }
    );
    cursor.setDate(cursor.getDate() + 1);
  }

  return items;
}

type TemplateExercise = {
  slug: string;
  sets: number;
  reps: number;
  intensity: number;
};

type TemplateWorkout = {
  name: string;
  exercises: TemplateExercise[];
};

export type SessionDurationMinutes = 30 | 45 | 60 | 90;

const exerciseBudgetBySessionDuration: Record<SessionDurationMinutes, number> = {
  30: 2,
  45: 3,
  60: 4,
  90: Number.POSITIVE_INFINITY
};

export function normalizeSessionDurationMinutes(value: number | undefined): SessionDurationMinutes {
  // 75 minutes was accepted by earlier profile versions. Treat it as the
  // standard one-hour budget until the user chooses one of the four new slots.
  if (value === 75) return 60;
  if (value === 30 || value === 45 || value === 60 || value === 90) return value;
  return 60;
}

function applySessionDurationBudget(template: TemplateWorkout[], duration: number | undefined) {
  const exerciseBudget = exerciseBudgetBySessionDuration[normalizeSessionDurationMinutes(duration)];
  return template.map((workout) => ({
    ...workout,
    // Template order intentionally puts the day's lead movement first.
    exercises: workout.exercises.slice(0, exerciseBudget)
  }));
}

const restrictedSlugs: Record<MovementRestriction, string[]> = {
  avoid_overhead_press: ["overhead_press"],
  avoid_horizontal_push: ["bench_press", "incline_dumbbell_press"],
  avoid_deep_knee_flexion: ["back_squat", "leg_press"],
  avoid_deadlift_hip_hinge: ["deadlift", "romanian_deadlift", "barbell_row"]
};

const controlledReplacements: Record<string, string[]> = {
  overhead_press: ["triceps_pushdown"],
  bench_press: ["overhead_press", "triceps_pushdown"],
  incline_dumbbell_press: ["overhead_press", "triceps_pushdown"],
  back_squat: ["romanian_deadlift", "leg_curl"],
  leg_press: ["romanian_deadlift", "leg_curl"],
  deadlift: ["leg_press", "leg_curl"],
  romanian_deadlift: ["leg_press", "leg_curl"],
  barbell_row: ["seated_cable_row"]
};

function isRestricted(slug: string, restrictions: MovementRestriction[]) {
  return restrictions.some((restriction) => restrictedSlugs[restriction].includes(slug));
}

function applyMovementRestrictions(template: TemplateWorkout[], restrictions: MovementRestriction[]) {
  if (restrictions.length === 0) return template;

  return template.map((workout) => {
    const exercises = workout.exercises.flatMap((exercise) => {
      if (!isRestricted(exercise.slug, restrictions)) return [exercise];
      const replacement = (controlledReplacements[exercise.slug] ?? [])
        .find((slug) => !isRestricted(slug, restrictions));
      return replacement ? [{ ...exercise, slug: replacement }] : [];
    });
    const hasMainOrSecondary = exercises.some((exercise) => {
      const role = getPrescriptionRole(exercise.slug);
      return role === "primary" || role === "secondary";
    });
    if (!hasMainOrSecondary) {
      const direction = workout.name.includes("腿") || workout.name.includes("蹲") ? "腿部" : "当前训练方向";
      throw new Error(`当前限制条件下，${direction}训练没有可安全替代的动作，请调整限制或咨询专业人士后再生成计划。`);
    }
    return { ...workout, exercises };
  });
}

// The user's reference plan defines the schedule format, not a plan to copy verbatim.
// MVP defaults use push/pull/squat focus plus A/B day intent, then choose broadly useful movements.
const pushPullSquatTemplate: TemplateWorkout[] = [
  {
    name: "推 A · 强度",
    exercises: [
      { slug: "bench_press", sets: 4, reps: 5, intensity: 0.95 },
      { slug: "overhead_press", sets: 3, reps: 5, intensity: 0.9 },
      { slug: "incline_dumbbell_press", sets: 3, reps: 8, intensity: 0.75 },
      { slug: "lateral_raise", sets: 3, reps: 12, intensity: 0.35 },
      { slug: "triceps_pushdown", sets: 3, reps: 12, intensity: 0.45 }
    ]
  },
  {
    name: "拉 B · 容量",
    exercises: [
      { slug: "barbell_row", sets: 4, reps: 10, intensity: 0.72 },
      { slug: "lat_pulldown", sets: 4, reps: 10, intensity: 0.72 },
      { slug: "seated_cable_row", sets: 3, reps: 12, intensity: 0.65 },
      { slug: "face_pull", sets: 3, reps: 15, intensity: 0.25 },
      { slug: "dumbbell_curl", sets: 3, reps: 12, intensity: 0.35 }
    ]
  },
  {
    name: "蹲 A · 强度",
    exercises: [
      { slug: "back_squat", sets: 4, reps: 5, intensity: 0.95 },
      { slug: "romanian_deadlift", sets: 3, reps: 8, intensity: 0.72 },
      { slug: "leg_press", sets: 3, reps: 10, intensity: 0.95 },
      { slug: "leg_curl", sets: 3, reps: 12, intensity: 0.42 },
      { slug: "standing_calf_raise", sets: 4, reps: 12, intensity: 0.45 }
    ]
  },
  {
    name: "推 B · 容量",
    exercises: [
      { slug: "bench_press", sets: 3, reps: 8, intensity: 0.78 },
      { slug: "incline_dumbbell_press", sets: 4, reps: 10, intensity: 0.72 },
      { slug: "overhead_press", sets: 3, reps: 8, intensity: 0.75 },
      { slug: "lateral_raise", sets: 4, reps: 15, intensity: 0.3 },
      { slug: "triceps_pushdown", sets: 3, reps: 15, intensity: 0.4 }
    ]
  },
  {
    name: "拉 A · 强度",
    exercises: [
      { slug: "barbell_row", sets: 4, reps: 6, intensity: 0.9 },
      { slug: "pull_up", sets: 4, reps: 6, intensity: 0 },
      { slug: "deadlift", sets: 3, reps: 3, intensity: 0.85 },
      { slug: "seated_cable_row", sets: 3, reps: 8, intensity: 0.72 },
      { slug: "dumbbell_curl", sets: 3, reps: 10, intensity: 0.4 }
    ]
  },
  {
    name: "蹲 B · 容量",
    exercises: [
      { slug: "back_squat", sets: 3, reps: 8, intensity: 0.75 },
      { slug: "leg_press", sets: 4, reps: 12, intensity: 0.85 },
      { slug: "romanian_deadlift", sets: 3, reps: 10, intensity: 0.65 },
      { slug: "leg_curl", sets: 3, reps: 15, intensity: 0.38 },
      { slug: "standing_calf_raise", sets: 4, reps: 15, intensity: 0.4 }
    ]
  }
];

const oneSplitTemplate: TemplateWorkout[] = [
  {
    name: "全身训练",
    exercises: [
      { slug: "bench_press", sets: 3, reps: 8, intensity: 0.75 },
      { slug: "barbell_row", sets: 3, reps: 8, intensity: 0.75 },
      { slug: "leg_press", sets: 3, reps: 10, intensity: 0.8 },
      { slug: "leg_curl", sets: 3, reps: 12, intensity: 0.42 },
      { slug: "lateral_raise", sets: 3, reps: 15, intensity: 0.3 }
    ]
  }
];

const threeSplitTemplate: TemplateWorkout[] = [
  { ...pushPullSquatTemplate[0], name: "胸肩三头" },
  { ...pushPullSquatTemplate[1], name: "背二头" },
  { ...pushPullSquatTemplate[2], name: "腿" }
];

const fourDayUpperLowerTemplate: TemplateWorkout[] = [
  {
    name: "上肢 A · 强度",
    exercises: [
      { slug: "bench_press", sets: 4, reps: 5, intensity: 0.95 },
      { slug: "overhead_press", sets: 3, reps: 5, intensity: 0.9 },
      { slug: "lat_pulldown", sets: 4, reps: 8, intensity: 0.72 },
      { slug: "seated_cable_row", sets: 3, reps: 8, intensity: 0.72 },
      { slug: "triceps_pushdown", sets: 3, reps: 10, intensity: 0.45 }
    ]
  },
  {
    name: "下肢 A · 强度",
    exercises: [
      { slug: "back_squat", sets: 4, reps: 5, intensity: 0.95 },
      { slug: "romanian_deadlift", sets: 3, reps: 6, intensity: 0.75 },
      { slug: "leg_curl", sets: 3, reps: 10, intensity: 0.42 },
      { slug: "standing_calf_raise", sets: 4, reps: 10, intensity: 0.45 }
    ]
  },
  {
    name: "上肢 B · 容量",
    exercises: [
      { slug: "bench_press", sets: 3, reps: 8, intensity: 0.78 },
      { slug: "incline_dumbbell_press", sets: 3, reps: 10, intensity: 0.72 },
      { slug: "lat_pulldown", sets: 3, reps: 12, intensity: 0.7 },
      { slug: "lateral_raise", sets: 4, reps: 15, intensity: 0.3 },
      { slug: "dumbbell_curl", sets: 3, reps: 12, intensity: 0.35 }
    ]
  },
  {
    name: "下肢 B · 容量",
    exercises: [
      { slug: "leg_press", sets: 4, reps: 10, intensity: 0.85 },
      { slug: "romanian_deadlift", sets: 3, reps: 10, intensity: 0.65 },
      { slug: "leg_curl", sets: 3, reps: 15, intensity: 0.38 },
      { slug: "standing_calf_raise", sets: 4, reps: 15, intensity: 0.4 }
    ]
  }
];

const fiveSplitTemplate: TemplateWorkout[] = [
  { ...pushPullSquatTemplate[0], name: "胸" },
  { ...pushPullSquatTemplate[1], name: "背" },
  { ...pushPullSquatTemplate[2], name: "腿" },
  {
    name: "肩",
    exercises: [
      { slug: "overhead_press", sets: 4, reps: 8, intensity: 0.75 },
      { slug: "lateral_raise", sets: 4, reps: 15, intensity: 0.3 },
      { slug: "face_pull", sets: 3, reps: 15, intensity: 0.25 },
      { slug: "incline_dumbbell_press", sets: 3, reps: 10, intensity: 0.7 }
    ]
  },
  {
    name: "手臂",
    exercises: [
      { slug: "dumbbell_curl", sets: 4, reps: 12, intensity: 0.35 },
      { slug: "triceps_pushdown", sets: 4, reps: 12, intensity: 0.45 },
      { slug: "lateral_raise", sets: 3, reps: 15, intensity: 0.3 },
      { slug: "face_pull", sets: 3, reps: 15, intensity: 0.25 }
    ]
  }
];

export function resolveProfileWorkingWeight({
  estimatedOneRepMax,
  trainingMax
}: {
  estimatedOneRepMax: number;
  trainingMax: number;
}) {
  return Number.isFinite(trainingMax) && trainingMax > 0 ? trainingMax : estimatedOneRepMax;
}

export function chooseTemplate(type: TemplateType) {
  if (type === "push_pull_squat") return pushPullSquatTemplate;
  if (type === "one_split") return oneSplitTemplate;
  if (type === "three_split" || type === "three_day_full_body") return threeSplitTemplate;
  if (type === "four_day_upper_lower") return fourDayUpperLowerTemplate;
  return type === "five_split" ? fiveSplitTemplate : pushPullSquatTemplate.slice(0, 4);
}

export function buildFourWeekProgram({
  templateType,
  availableWeekdays,
  schedule,
  exerciseProfiles,
  startDate = new Date(),
  weekCount = 4,
  trainingDaysPerWeek,
  goal = "strength",
  experienceLevel = "intermediate",
  nutritionAdherence = "moderate",
  proteinTargetMet = false,
  recoveryStatus = "normal",
  currentBodyWeightKg = null,
  targetWeightChangeKgPerWeek = null,
  weightChangeLast14DaysKg = null,
  restrictions = [],
  sessionDurationMinutes
}: {
  templateType: TemplateType;
  availableWeekdays?: number[];
  schedule?: ScheduleConfig;
  exerciseProfiles: ExerciseProfile[];
  startDate?: Date;
  weekCount?: number;
  trainingDaysPerWeek?: number;
  goal?: PlanGoal;
  experienceLevel?: ExperienceLevel;
  nutritionAdherence?: NutritionAdherence;
  proteinTargetMet?: boolean;
  recoveryStatus?: RecoveryStatus;
  currentBodyWeightKg?: number | null;
  targetWeightChangeKgPerWeek?: number | null;
  weightChangeLast14DaysKg?: number | null;
  restrictions?: MovementRestriction[];
  sessionDurationMinutes?: number;
}) {
  const template = applySessionDurationBudget(
    applyMovementRestrictions(chooseTemplate(templateType), restrictions),
    sessionDurationMinutes
  );
  const profileBySlug = new Map(exerciseProfiles.map((profile) => [profile.slug, profile]));
  const normalizedWeekCount = normalizeWeekCount(weekCount);
  const prescriptionPolicy = getPrescriptionPolicy({
    goal,
    experienceLevel,
    nutritionAdherence,
    proteinTargetMet,
    recoveryStatus,
    currentBodyWeightKg,
    targetWeightChangeKgPerWeek,
    weightChangeLast14DaysKg
  });
  const workoutDates = buildWorkoutDates(
    startDate,
    schedule ?? { mode: "fixed_weekdays", weekdays: availableWeekdays ?? [1, 3, 5] },
    normalizedWeekCount,
    normalizeTrainingDaysPerWeek(trainingDaysPerWeek, template.length)
  );

  const trainingWorkouts: PlannedTrainingWorkout[] = workoutDates.map((date, index) => {
    const weekIndex = getCalendarWeekIndex(date, startDate);
    const templateWorkout = template[index % template.length];
    const blockWeek = weekIndex % 4;
    const bump = blockWeek === 0
      ? 0
      : blockWeek === 1
        ? prescriptionPolicy.progressionPercent
        : blockWeek === 2
          ? prescriptionPolicy.progressionPercent * 2
          : -0.075;
    const isDeloadWeek = blockWeek === 3;

    return {
      name: `第 ${weekIndex + 1} 周 · ${templateWorkout.name}`,
      scheduledDate: formatDate(date),
      sequenceIndex: index,
      exercises: templateWorkout.exercises.map((item) => {
        const profile = profileBySlug.get(item.slug);
        const role = getPrescriptionRole(item.slug);
        const targetReps = item.reps + (role === "primary"
          ? prescriptionPolicy.primaryRepAdjustment
          : role === "secondary"
            ? prescriptionPolicy.secondaryRepAdjustment
            : 0);
        const targetWeight = resolvePrescriptionWeight({
          role,
          profile: profile ?? null,
          relatedProfile: profileBySlug.get(getRelatedPrimarySlug(item.slug)) ?? null,
          targetReps,
          baseRatio: role === "accessory" || role === "bodyweight"
            ? 1
            : item.intensity + bump + prescriptionPolicy.loadAdjustment,
          increment: profile?.increment ?? 2.5
        });
        const targetSets = Math.max(2, item.sets + prescriptionPolicy.setsAdjustment + (isDeloadWeek ? -1 : 0));
        const hasRequiredAnchor = role === "secondary"
          ? Boolean(profileBySlug.get(getRelatedPrimarySlug(item.slug)))
          : role === "primary"
            ? Boolean(profile)
            : true;

        return {
          exerciseSlug: item.slug,
          targetSets: experienceLevel === "beginner" && !hasRequiredAnchor ? Math.min(3, targetSets) : targetSets,
          targetReps,
          targetWeight
        };
      })
    };
  });

  return expandScheduleItems(
    trainingWorkouts,
    schedule ?? { mode: "fixed_weekdays", weekdays: availableWeekdays ?? [1, 3, 5] }
  );
}

export function getTemplateType(trainingDaysPerWeek: number): TemplateType {
  if (trainingDaysPerWeek <= 2) return "one_split";
  if (trainingDaysPerWeek === 3) return "three_split";
  if (trainingDaysPerWeek === 4) return "four_day_upper_lower";
  if (trainingDaysPerWeek === 5) return "five_split";
  return "push_pull_squat";
}

const compatibleTrainingDays: Record<TemplateType, number[]> = {
  one_split: [1, 2],
  three_split: [3],
  three_day_full_body: [3],
  four_day_upper_lower: [4],
  five_split: [5],
  push_pull_squat: [6, 7]
};

export function validateScheduleAndTemplate({
  templateType,
  trainingDaysPerWeek,
  schedule
}: {
  templateType: TemplateType;
  trainingDaysPerWeek: number;
  schedule: ScheduleConfig;
}): { ok: true } | { ok: false; message: string } {
  if (schedule.mode === "fixed_weekdays" && schedule.weekdays.length !== trainingDaysPerWeek) {
    return {
      ok: false,
      message: `固定星期已选 ${schedule.weekdays.length} 天，请选择 ${trainingDaysPerWeek} 天以匹配每周训练天数。`
    };
  }
  if (schedule.mode === "cadence") {
    const trainDays = Math.max(1, schedule.trainDays ?? 1);
    const cycleDays = trainDays + Math.max(0, schedule.restDays);
    if (trainDays * 7 / cycleDays > trainingDaysPerWeek) {
      return {
        ok: false,
        message: `当前练休循环平均每周超过 ${trainingDaysPerWeek} 天训练，请增加休息日或调整每周训练天数。`
      };
    }
  }
  if (!compatibleTrainingDays[templateType].includes(trainingDaysPerWeek)) {
    const label = templateOptions.find((option) => option.value === templateType)?.label ?? "当前模板";
    return {
      ok: false,
      message: `${label}适合每周 ${compatibleTrainingDays[templateType].join(" 或 ")} 天训练；请调整训练天数或选择匹配的模板。`
    };
  }
  return { ok: true };
}

function buildWorkoutDates(startDate: Date, schedule: ScheduleConfig, weekCount: number, trainingDaysPerWeek: number) {
  const dates: Date[] = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const endExclusive = new Date(cursor);
  endExclusive.setDate(endExclusive.getDate() + weekCount * 7);

  if (schedule.mode === "flexible") {
    for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
      for (let dayIndex = 0; dayIndex < trainingDaysPerWeek; dayIndex += 1) {
        const date = new Date(cursor);
        date.setDate(date.getDate() + weekIndex * 7 + dayIndex);
        dates.push(date);
      }
    }
    return dates;
  }

  if (schedule.mode === "cadence") {
    const trainDays = Math.max(1, Math.floor(schedule.trainDays ?? 1));
    const restDays = Math.max(0, Math.floor(schedule.restDays));
    while (cursor < endExclusive) {
      dates.push(new Date(cursor));
      const completedBlock = dates.length % trainDays === 0;
      cursor.setDate(cursor.getDate() + (completedBlock ? restDays + 1 : 1));
    }
    return dates;
  }

  const sortedWeekdays = [...schedule.weekdays].sort((a, b) => a - b);
  if (sortedWeekdays.length === 0) return dates;

  while (cursor < endExclusive) {
    if (sortedWeekdays.includes(cursor.getDay())) {
      dates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function getCalendarWeekIndex(date: Date, startDate: Date) {
  const normalizedStart = new Date(startDate);
  normalizedStart.setHours(0, 0, 0, 0);
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);
  return Math.floor((normalizedDate.getTime() - normalizedStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function normalizeTrainingDaysPerWeek(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 7) return fallback;
  return value;
}

function normalizeWeekCount(value: number | undefined) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 12) return 4;
  return value;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
