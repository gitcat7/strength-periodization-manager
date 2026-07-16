import { reviewedExerciseNamesZh } from "./exercise-catalog-names";
import { isWgerExternalId, toExternalExerciseSnapshot, type ExternalExerciseReference } from "./external-exercise";
import type { ReviewedExercise } from "./reviewed-exercise-library";

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
export type ExternalStandaloneDraftExercise = {
  externalReference: ExternalExerciseReference;
  sets: StandaloneSetDraft[];
};
export type ManualExerciseReference = {
  equipment: string[];
  id: string;
  loadType: "weighted" | "bodyweight" | "assisted";
  muscles: string[];
  name: string;
};
export type ManualStandaloneDraftExercise = {
  manualExercise: ManualExerciseReference;
  sets: StandaloneSetDraft[];
};
export type ReviewedStandaloneDraftExercise = {
  reviewedExercise: ReviewedExercise;
  sets: StandaloneSetDraft[];
};
type StoredStandaloneDraft = {
  workout_id: string;
  exercises: Array<{
    exercise_id: string | null;
    exercise_metadata_snapshot?: unknown;
    exercise_name_snapshot?: unknown;
    exercise_provider?: unknown;
    external_exercise_id?: unknown;
    sets: StandaloneSetDraft[];
  }>;
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
  exercises: readonly ((SelectableExercise & Partial<Pick<StandaloneDraftExercise, "sets">>) | ExternalStandaloneDraftExercise | ManualStandaloneDraftExercise | ReviewedStandaloneDraftExercise)[],
  workoutId?: string
) {
  return {
    ...(workoutId ? { workout_id: workoutId } : {}),
    scheduled_date: date,
    status: "draft" as const,
    exercises: exercises.map((exercise) => {
      const sets = (exercise.sets ?? []).map((set, index) => ({ set_index: index + 1, ...set }));
      if ("externalReference" in exercise) {
        return {
          exercise_id: null,
          exercise_metadata_snapshot: toExternalExerciseSnapshot(exercise.externalReference),
          exercise_name_snapshot: exercise.externalReference.name,
          exercise_provider: "wger" as const,
          external_exercise_id: exercise.externalReference.externalId,
          sets
        };
      }
      if ("manualExercise" in exercise) {
        return {
          exercise_id: null,
          exercise_metadata_snapshot: {
            equipment: exercise.manualExercise.equipment,
            loadType: exercise.manualExercise.loadType,
            muscles: exercise.manualExercise.muscles
          },
          exercise_name_snapshot: exercise.manualExercise.name,
          exercise_provider: "manual" as const,
          external_exercise_id: exercise.manualExercise.id,
          sets
        };
      }
      if ("reviewedExercise" in exercise) {
        const reviewed = exercise.reviewedExercise;
        return {
          exercise_id: null,
          exercise_metadata_snapshot: {
            equipment: reviewed.equipment,
            loadType: reviewed.loadType,
            movementPattern: reviewed.movementPattern,
            muscles: reviewed.primaryMuscles,
            riskLevel: reviewed.riskLevel
          },
          exercise_name_snapshot: reviewed.nameZh,
          exercise_provider: "reviewed" as const,
          external_exercise_id: `reviewed:${reviewed.id}`,
          sets
        };
      }
      return { exercise_id: exercise.id, sets };
    })
  };
}

export function parseStandaloneWorkoutDraft(value: unknown): StoredStandaloneDraft {
  if (!isRecord(value) || typeof value.workout_id !== "string" || !Array.isArray(value.exercises)) {
    throw new Error("INVALID_EXERCISE_REFERENCE");
  }
  for (const exercise of value.exercises) {
    if (!isRecord(exercise) || !Array.isArray(exercise.sets)) throw new Error("INVALID_EXERCISE_REFERENCE");
    const local = typeof exercise.exercise_id === "string";
    const hasExternalFields = [
      exercise.exercise_provider,
      exercise.external_exercise_id,
      exercise.exercise_name_snapshot,
      exercise.exercise_metadata_snapshot
    ].some((field) => field !== null && field !== undefined);
    const external = exercise.exercise_id === null
      && exercise.exercise_provider === "wger"
      && typeof exercise.external_exercise_id === "string"
      && isWgerExternalId(exercise.external_exercise_id)
      && typeof exercise.exercise_name_snapshot === "string"
      && exercise.exercise_name_snapshot.trim().length > 0
      && isRecord(exercise.exercise_metadata_snapshot);
    const manual = exercise.exercise_id === null
      && exercise.exercise_provider === "manual"
      && typeof exercise.external_exercise_id === "string"
      && isManualStandaloneId(exercise.external_exercise_id)
      && typeof exercise.exercise_name_snapshot === "string"
      && exercise.exercise_name_snapshot.trim().length > 0
      && isManualMetadata(exercise.exercise_metadata_snapshot);
    const reviewed = exercise.exercise_id === null
      && exercise.exercise_provider === "reviewed"
      && typeof exercise.external_exercise_id === "string"
      && /^reviewed:[a-z0-9-]{2,80}$/.test(exercise.external_exercise_id)
      && typeof exercise.exercise_name_snapshot === "string"
      && exercise.exercise_name_snapshot.trim().length > 0
      && isManualMetadata(exercise.exercise_metadata_snapshot);
    if ((local && hasExternalFields) || (!local && !external && !manual && !reviewed)) throw new Error("INVALID_EXERCISE_REFERENCE");
  }
  return value as StoredStandaloneDraft;
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
      if (typeof item.exercise_id !== "string") return [];
      const exercise = selectableById.get(item.exercise_id);
      return exercise ? [{ ...exercise, sets: item.sets }] : [];
    })
  };
}

export function isStandaloneWorkout(workout: { program_id: string | null }) {
  return workout.program_id === null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isManualStandaloneId(value: string) {
  return /^manual:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isManualMetadata(value: unknown) {
  return isRecord(value)
    && Array.isArray(value.equipment)
    && Array.isArray(value.muscles)
    && (value.loadType === "weighted" || value.loadType === "bodyweight" || value.loadType === "assisted");
}
