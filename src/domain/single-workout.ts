export type SingleWorkoutCategory = "胸" | "背" | "腿" | "肩" | "手臂" | "核心" | "全身";

export type SelectableExercise = {
  id: string;
  name: string;
  category: string;
  defaultIncrement: number;
};

const categoryKeywords: Record<SingleWorkoutCategory, string[]> = {
  胸: ["chest", "pec", "胸"],
  背: ["back", "lats", "背", "pull"],
  腿: ["leg", "quad", "hamstring", "glute", "squat", "腿", "臀"],
  肩: ["shoulder", "delt", "肩"],
  手臂: ["arm", "bicep", "tricep", "forearm", "手臂", "二头", "三头"],
  核心: ["core", "abs", "腹", "核心"],
  全身: ["full", "cardio", "全身"]
};

export function filterSelectableExercises(
  exercises: readonly SelectableExercise[],
  filters: { category: SingleWorkoutCategory; query: string }
) {
  const query = filters.query.trim().toLocaleLowerCase();
  const keywords = categoryKeywords[filters.category];

  return exercises.filter((exercise) => {
    const category = exercise.category.toLocaleLowerCase();
    return (!query || exercise.name.toLocaleLowerCase().includes(query)) && keywords.some((keyword) => category.includes(keyword));
  });
}

export function toggleSelectedExercise(selected: readonly SelectableExercise[], exercise: SelectableExercise) {
  return selected.some((item) => item.id === exercise.id) ? [...selected] : [...selected, exercise];
}

export function buildStandaloneWorkoutPayload(date: string, exercises: readonly SelectableExercise[]) {
  return {
    workout: {
      day_type: "training" as const,
      name: `单次训练 · ${date}`,
      program_id: null,
      schedule_index: 0,
      scheduled_date: date,
      sequence_index: 0,
      status: "draft" as const
    },
    exercises: exercises.map((exercise, index) => ({
      exercise_id: exercise.id,
      order_index: index + 1,
      target_reps: 8,
      target_sets: 3,
      target_weight: 0
    }))
  };
}

export function isStandaloneWorkout(workout: { program_id: string | null }) {
  return workout.program_id === null;
}
