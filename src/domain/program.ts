import { roundToNearestPlate } from "@/domain/strength";

export type TemplateType = "three_day_full_body" | "four_day_upper_lower" | "push_pull_squat";

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
  name: string;
  scheduledDate: string;
  sequenceIndex: number;
  exercises: PlannedWorkoutExercise[];
};

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
    name: "有氧日 · 恢复",
    exercises: [
      { slug: "cardio_zone2", sets: 1, reps: 35, intensity: 0 }
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

const threeDayTemplate: TemplateWorkout[] = [
  pushPullSquatTemplate[0],
  pushPullSquatTemplate[1],
  pushPullSquatTemplate[2]
];

const fourDayTemplate: TemplateWorkout[] = [
  pushPullSquatTemplate[0],
  pushPullSquatTemplate[1],
  pushPullSquatTemplate[2],
  pushPullSquatTemplate[4]
];

const weekIntensityBumps = [0, 0.025, 0.05, -0.075];

export function chooseTemplate(type: TemplateType) {
  if (type === "push_pull_squat") return pushPullSquatTemplate;
  return type === "four_day_upper_lower" ? fourDayTemplate : threeDayTemplate;
}

export function buildFourWeekProgram({
  templateType,
  availableWeekdays,
  exerciseProfiles,
  startDate = new Date()
}: {
  templateType: TemplateType;
  availableWeekdays: number[];
  exerciseProfiles: ExerciseProfile[];
  startDate?: Date;
}) {
  const template = chooseTemplate(templateType);
  const profileBySlug = new Map(exerciseProfiles.map((profile) => [profile.slug, profile]));
  const workoutDates = buildWorkoutDates(startDate, availableWeekdays, template.length * 4);

  return workoutDates.map((date, index) => {
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
}

export function getTemplateType(trainingDaysPerWeek: number): TemplateType {
  if (trainingDaysPerWeek === 7) return "push_pull_squat";
  return trainingDaysPerWeek === 4 ? "four_day_upper_lower" : "three_day_full_body";
}

function buildWorkoutDates(startDate: Date, availableWeekdays: number[], count: number) {
  const sortedWeekdays = [...availableWeekdays].sort((a, b) => a - b);
  const dates: Date[] = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

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
