import { reviewedExerciseNamesZh } from "./exercise-catalog-names";

export type SingleWorkoutCategory = "胸" | "背" | "腿" | "肩" | "手臂" | "核心" | "全身";

export type SelectableExercise = {
  id: string;
  name: string;
  category: string;
  catalogExternalId?: string | null;
  defaultIncrement: number;
  movementPattern?: string | null;
  slug?: string | null;
  trainingDirection?: string | null;
};

export type StandaloneSetDraft = { completed: boolean; reps: string; rpe: string; weight: string };
export type StandaloneDraftExercise = SelectableExercise & { sets: StandaloneSetDraft[] };
type StoredStandaloneDraft = {
  workout_id: string;
  exercises: Array<{ exercise_id: string; sets: StandaloneSetDraft[] }>;
};

const sectionMatchers: Record<SingleWorkoutCategory, RegExp> = {
  胸: /chest|pec|bench|卧推|飞鸟|夹胸|horizontal_press/,
  背: /back|latissimus|row|pull.?down|划船|下拉|引体|背|horizontal_pull|vertical_pull/,
  腿: /leg|quad|hamstring|glute|squat|lunge|深蹲|硬拉|腿举|臀|腿|hip_hinge/,
  肩: /shoulder|delt|raise|overhead|vertical_press|推举|侧平举|前平举|肩|shoulder_abduction/,
  手臂: /arm|bicep|tricep|forearm|curl|extension|弯举|二头|三头|臂屈伸|elbow_flexion|elbow_extension/,
  核心: /core|abs|crunch|plank|trunk|卷腹|平板|腹|核心/,
  全身: /full|cardio|burpee|全身|波比|跳绳|冲刺|full_body/
};

function exerciseSearchText(exercise: SelectableExercise) {
  return [exercise.category, exercise.movementPattern, exercise.name, exercise.slug, exercise.trainingDirection, exercise.catalogExternalId, getSelectableExerciseLabel(exercise)]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLocaleLowerCase();
}

export function getSelectableExerciseLabel(exercise: SelectableExercise) {
  return exercise.catalogExternalId ? reviewedExerciseNamesZh[exercise.catalogExternalId] ?? exercise.name : exercise.name;
}

function belongsToSection(exercise: SelectableExercise, category: SingleWorkoutCategory) {
  const text = exerciseSearchText(exercise);
  const explicitSection = (Object.keys(sectionMatchers) as SingleWorkoutCategory[]).find((section) => sectionMatchers[section].test(text));
  if (explicitSection) return explicitSection === category;

  const bridgeCategory = exercise.category.toLocaleLowerCase();
  return (category === "胸" && bridgeCategory === "push")
    || (category === "背" && bridgeCategory === "pull")
    || (category === "腿" && bridgeCategory === "squat")
    || (category === "全身" && bridgeCategory === "cardio");
}

export function filterSelectableExercises(
  exercises: readonly SelectableExercise[],
  filters: { category: SingleWorkoutCategory; query: string }
) {
  const query = filters.query.trim().toLocaleLowerCase();

  return exercises.filter((exercise) => {
    // A typed Chinese name is an explicit search intent and must span all seven sections.
    if (query) return exerciseSearchText(exercise).includes(query);
    return belongsToSection(exercise, filters.category);
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

export function buildStandaloneWorkoutSavePayload(
  date: string,
  exercises: readonly (SelectableExercise & Partial<Pick<StandaloneDraftExercise, "sets">>)[],
  workoutId?: string
) {
  return {
    ...(workoutId ? { workout_id: workoutId } : {}),
    scheduled_date: date,
    status: "draft" as const,
    exercises: exercises.map((exercise) => ({
      exercise_id: exercise.id,
      sets: (exercise.sets ?? []).map((set, index) => ({ set_index: index + 1, ...set }))
    }))
  };
}

export function restoreStandaloneDraft(
  stored: StoredStandaloneDraft | null,
  exercises: readonly SelectableExercise[]
): { workoutId: string | null; exercises: StandaloneDraftExercise[] } {
  if (!stored) return { workoutId: null, exercises: [] };
  const selectableById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  return {
    workoutId: stored.workout_id,
    exercises: stored.exercises.flatMap((item) => {
      const exercise = selectableById.get(item.exercise_id);
      return exercise ? [{ ...exercise, sets: item.sets }] : [];
    })
  };
}

export function isStandaloneWorkout(workout: { program_id: string | null }) {
  return workout.program_id === null;
}
