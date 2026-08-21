export type TrainingDirection = "push" | "pull" | "squat" | "cardio";

export type LocalExerciseMetadata = {
  id: string;
  trainingDirection: TrainingDirection | null;
  isMainLift: boolean;
};

export type PrescriptionDraftExercise = {
  exercise: LocalExerciseMetadata;
  targetSets: number;
  targetReps: number;
  targetWeight: number;
};

export type PrescriptionGuardrailResult = {
  blockers: string[];
  warnings: string[];
  canSave: boolean;
  requiresConfirmation: boolean;
};

export function assessWorkoutPrescription(input: {
  direction: TrainingDirection | null;
  currentHasMainLift: boolean;
  exercises: PrescriptionDraftExercise[];
  weeklySetsAfterSave?: number;
}): PrescriptionGuardrailResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const ids = input.exercises.map((item) => item.exercise.id);
  const mainLiftCount = input.exercises.filter((item) => item.exercise.isMainLift).length;

  if (!input.direction) blockers.push("当天缺少有效训练方向，请先修正计划。");
  if (input.exercises.length < 1 || input.exercises.length > 12) blockers.push("动作数量必须在 1–12 个之间。");
  if (new Set(ids).size !== ids.length) blockers.push("动作不能重复。");
  if (input.exercises.some((item) => !item.exercise.trainingDirection)) blockers.push("每个动作都需要结构化训练方向，请先修正动作资料。");
  if (input.direction && input.exercises.some((item) => item.exercise.trainingDirection && item.exercise.trainingDirection !== input.direction)) {
    blockers.push("动作方向与当天训练方向不兼容。");
  }
  if (input.currentHasMainLift && mainLiftCount === 0) blockers.push("主项不能直接删除，请先添加同方向主项替代。");
  if (input.exercises.some((item) => !Number.isFinite(item.targetSets) || !Number.isFinite(item.targetReps) || !Number.isFinite(item.targetWeight) || item.targetSets < 1 || item.targetSets > 20 || item.targetReps < 1 || item.targetReps > 1000 || item.targetWeight < 0 || item.targetWeight > 10000)) {
    blockers.push("组数、次数或重量无效，请检查处方数值。");
  }
  if (input.weeklySetsAfterSave !== undefined && (input.weeklySetsAfterSave < 4 || input.weeklySetsAfterSave > 30)) {
    warnings.push("本周有效组数明显偏高或偏低，请确认恢复与训练经验。");
  }
  if (mainLiftCount > 1) warnings.push("同日重主项较多，请确认恢复安排。");

  return { blockers, warnings, canSave: blockers.length === 0, requiresConfirmation: blockers.length === 0 && warnings.length > 0 };
}
