import { roundToNearestPlate } from "@/domain/strength";

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

export const templateOptions: Array<{ description: string; label: string; value: TemplateType }> = [
  { value: "one_split", label: "一分化", description: "全身训练，适合每周 2-3 次稳定入门。" },
  { value: "three_split", label: "三分化", description: "胸肩三头 / 背二头 / 腿，按顺序循环。" },
  { value: "five_split", label: "五分化", description: "胸 / 背 / 腿 / 肩 / 手臂，单日更聚焦。" },
  { value: "push_pull_squat", label: "推拉蹲", description: "推 / 拉 / 蹲 A/B，交替强度与容量。" }
];

export type ExerciseProfile = {
  slug: string;
  id: string;
  workingWeight: number;
  increment: number;
};

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

const weekIntensityBumps = [0, 0.025, 0.05, -0.075];

export function chooseTemplate(type: TemplateType) {
  if (type === "push_pull_squat") return pushPullSquatTemplate;
  if (type === "one_split") return oneSplitTemplate;
  if (type === "three_split" || type === "three_day_full_body") return threeSplitTemplate;
  return type === "five_split" ? fiveSplitTemplate : pushPullSquatTemplate.slice(0, 4);
}

export function buildFourWeekProgram({
  templateType,
  availableWeekdays,
  schedule,
  exerciseProfiles,
  startDate = new Date()
}: {
  templateType: TemplateType;
  availableWeekdays?: number[];
  schedule?: ScheduleConfig;
  exerciseProfiles: ExerciseProfile[];
  startDate?: Date;
}) {
  const template = chooseTemplate(templateType);
  const profileBySlug = new Map(exerciseProfiles.map((profile) => [profile.slug, profile]));
  const workoutDates = buildWorkoutDates(
    startDate,
    schedule ?? { mode: "fixed_weekdays", weekdays: availableWeekdays ?? [1, 3, 5] },
    template.length * 4
  );

  const trainingWorkouts: PlannedTrainingWorkout[] = workoutDates.map((date, index) => {
    const weekIndex = Math.floor(index / template.length);
    const templateWorkout = template[index % template.length];
    const bump = weekIntensityBumps[weekIndex] ?? 0;

    return {
      name: `第 ${weekIndex + 1} 周 · ${templateWorkout.name}`,
      scheduledDate: formatDate(date),
      sequenceIndex: index,
      exercises: templateWorkout.exercises.map((item) => {
        const profile = profileBySlug.get(item.slug);
        const targetWeight =
          profile && item.intensity > 0
            ? roundToNearestPlate(profile.workingWeight * (item.intensity + bump), profile.increment)
            : 0;

        return {
          exerciseSlug: item.slug,
          targetSets: item.sets,
          targetReps: item.reps,
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
  if (trainingDaysPerWeek === 7) return "push_pull_squat";
  return trainingDaysPerWeek === 4 ? "five_split" : "three_split";
}

function buildWorkoutDates(startDate: Date, schedule: ScheduleConfig, count: number) {
  const dates: Date[] = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  if (schedule.mode === "flexible") {
    while (dates.length < count) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  if (schedule.mode === "cadence") {
    const trainDays = Math.max(1, Math.floor(schedule.trainDays ?? 1));
    const restDays = Math.max(0, Math.floor(schedule.restDays));
    while (dates.length < count) {
      dates.push(new Date(cursor));
      const completedBlock = dates.length % trainDays === 0;
      cursor.setDate(cursor.getDate() + (completedBlock ? restDays + 1 : 1));
    }
    return dates;
  }

  const sortedWeekdays = [...schedule.weekdays].sort((a, b) => a - b);
  if (sortedWeekdays.length === 0) return dates;

  while (dates.length < count) {
    if (sortedWeekdays.includes(cursor.getDay())) {
      dates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
