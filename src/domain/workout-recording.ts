import type { ExerciseLoadType } from "./reviewed-exercise-library";

export type RecordableSet = {
  completed: boolean;
  reps: string;
  rpe: string;
  weight: string;
};

export type RecordedSetWithLoadType = RecordableSet & { loadType: ExerciseLoadType };
export type RecordedSetErrors = Partial<Record<"reps" | "rpe" | "weight", string>>;

const maxWeightKg = 10_000;
const maxRepetitions = 1_000;

export function validateRecordedSet(set: RecordableSet, loadType: ExerciseLoadType): RecordedSetErrors {
  if (!set.completed) return {};
  const errors: RecordedSetErrors = {};
  const reps = parseInteger(set.reps);
  const rpe = parseNumber(set.rpe);
  const weight = parseNumber(set.weight);

  if (reps === null || reps < 1 || reps > maxRepetitions) errors.reps = "次数需为 1–1000 的整数。";
  if (rpe === null || rpe < 1 || rpe > 10 || !isSupportedRpe(rpe)) errors.rpe = "RPE 需为 1–10。";
  if (set.weight.trim() && (weight === null || weight < 0 || weight > maxWeightKg)) errors.weight = "重量需为 0–10000 kg。";
  if (loadType === "weighted" && (weight === null || weight <= 0)) errors.weight = "负重动作完成时需填写正数重量（kg）。";
  if (loadType === "assisted" && weight === null) errors.weight = "辅助动作完成时需填写辅助重量（kg）。";

  return errors;
}

export function buildCompletionSummary(sets: readonly RecordedSetWithLoadType[]) {
  const completed = sets.filter((set) => set.completed);
  const weightedSets = completed.flatMap((set) => {
    if (set.loadType !== "weighted") return [];
    const weight = parseNumber(set.weight);
    const reps = parseInteger(set.reps);
    return weight !== null && weight > 0 && reps !== null && reps > 0 ? [{ reps, weight }] : [];
  });
  const tonnage = weightedSets.reduce((total, set) => total + set.weight * set.reps, 0);
  const bestE1rm = weightedSets.reduce<number | null>((best, set) => {
    const estimate = round(set.weight * (1 + set.reps / 30));
    return best === null || estimate > best ? estimate : best;
  }, null);

  return {
    bestE1rm,
    completedSetCount: completed.length,
    incompleteSetCount: sets.length - completed.length,
    totalTonnage: weightedSets.length ? round(tonnage) : null
  };
}

function parseInteger(value: string) {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseNumber(value: string) {
  const normalized = value.trim();
  if (!normalized || !/^(?:\d+|\d+\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSupportedRpe(value: number) {
  return Number.isInteger(value * 2);
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
