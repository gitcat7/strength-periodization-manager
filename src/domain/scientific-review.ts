import { roundToNearestPlate } from "@/domain/strength";

export type ScientificReviewType = "increase" | "hold" | "decrease" | "deload";
export type ScientificReviewReasonCode =
  | "insufficient_data"
  | "incomplete_sets"
  | "below_target_performance"
  | "high_rpe"
  | "long_interruption"
  | "short_recovery_gap"
  | "recovery_caution"
  | "profile_caution"
  | "progression_ready"
  | "accessory_observe";

export const SCIENTIFIC_REVIEW_THRESHOLDS = {
  bodyweightChangePercent: 3,
  highRpe: 9,
  longInterruptionDays: 14,
  progressionMaxRpe: 8,
  shortRecoveryGapDays: 1
} as const;

export type ScientificReviewSet = {
  targetWeight: number;
  targetReps: number;
  actualWeight: number | null;
  actualReps: number | null;
  rpe: number | null;
  completed: boolean;
};

export type ScientificReview = {
  type: ScientificReviewType;
  suggestedWeight: number;
  suggestedSets: number;
  reasonCode: ScientificReviewReasonCode;
  reason: string;
  advice: "none" | "recovery" | "delay";
};

export function buildScientificReview({
  daysSincePreviousTraining,
  increment,
  isMainLift,
  logs,
  nutrition,
  bodyweightChangePercent,
  recovery,
  targetSets,
  targetWeight
}: {
  daysSincePreviousTraining?: number | null;
  increment: number;
  isMainLift: boolean;
  logs: ScientificReviewSet[];
  nutrition?: "adequate" | "poor" | null;
  bodyweightChangePercent?: number | null;
  recovery?: "normal" | "poor" | null;
  targetSets: number;
  targetWeight: number;
}): ScientificReview {
  const safeWeight = Math.max(0, targetWeight);
  const safeSets = Math.max(1, Math.floor(targetSets));
  const completed = logs.filter((log) => log.completed);
  const incrementKg = increment > 0 ? increment : 2.5;
  const invalidPerformance = completed.length === 0 || completed.some(
    (log) => !isPositiveInteger(log.actualReps) || !isPositiveWeight(log.actualWeight) || !isValidRpe(log.rpe)
  );

  if (safeWeight <= 0 || invalidPerformance) {
    return hold(safeWeight, safeSets, "insufficient_data", "数据不足，保持当前处方并继续记录。");
  }

  if (completed.length < safeSets || logs.some((log) => !log.completed)) {
    return hold(safeWeight, safeSets, "incomplete_sets", "完成组数未达到计划，保持当前处方，先补齐动作质量。");
  }

  if (completed.some((log) => Number(log.actualWeight) < log.targetWeight || Number(log.actualReps) < log.targetReps)) {
    return hold(safeWeight, safeSets, "below_target_performance", "实际重量或次数未达到目标，保持当前处方并优先完成质量。");
  }

  if (
    recovery === "poor"
    || nutrition === "poor"
    || (typeof bodyweightChangePercent === "number" && Number.isFinite(bodyweightChangePercent) && Math.abs(bodyweightChangePercent) >= SCIENTIFIC_REVIEW_THRESHOLDS.bodyweightChangePercent)
  ) {
    const profileReasonCode = recovery === "poor" ? "recovery_caution" : "profile_caution";
    return deload(
      safeWeight,
      safeSets,
      incrementKg,
      profileReasonCode,
      recovery === "poor" ? "恢复状态偏差，建议下次减量恢复，不进行加重。" : "饮食执行或体重变化提示恢复风险，建议下次减量恢复，不进行加重。",
      "recovery"
    );
  }

  if (typeof daysSincePreviousTraining === "number" && daysSincePreviousTraining >= 0 && daysSincePreviousTraining <= SCIENTIFIC_REVIEW_THRESHOLDS.shortRecoveryGapDays) {
    return { advice: "delay", reason: "与上次训练间隔不足 2 个日历日，建议保持处方并延后推进。", reasonCode: "short_recovery_gap", suggestedSets: safeSets, suggestedWeight: safeWeight, type: "hold" };
  }

  if (typeof daysSincePreviousTraining === "number" && daysSincePreviousTraining > SCIENTIFIC_REVIEW_THRESHOLDS.longInterruptionDays) {
    return deload(safeWeight, safeSets, incrementKg, "long_interruption", "训练间隔较长，建议减量恢复后再推进。", "recovery");
  }

  const finalRpe = completed.at(-1)?.rpe;
  const averageRpe = completed.reduce((sum, log) => sum + Number(log.rpe), 0) / completed.length;
  if ((typeof finalRpe === "number" && finalRpe >= SCIENTIFIC_REVIEW_THRESHOLDS.highRpe) || averageRpe >= SCIENTIFIC_REVIEW_THRESHOLDS.highRpe) {
    return {
      advice: "recovery",
      reason: "RPE 偏高，下次先小幅降重，优先恢复与动作质量。",
      reasonCode: "high_rpe",
      suggestedSets: safeSets,
      suggestedWeight: roundToNearestPlate(safeWeight * 0.95, incrementKg),
      type: "decrease"
    };
  }

  if (!isMainLift) {
    return hold(safeWeight, safeSets, "accessory_observe", "辅助动作完成良好，先保持重量并继续观察完成质量。");
  }

  if (typeof finalRpe === "number" && finalRpe <= SCIENTIFIC_REVIEW_THRESHOLDS.progressionMaxRpe && averageRpe <= SCIENTIFIC_REVIEW_THRESHOLDS.progressionMaxRpe) {
    return {
      advice: "none",
      reason: "主项全部完成且 RPE 合适，下次可按器械增量小幅加重。",
      reasonCode: "progression_ready",
      suggestedSets: safeSets,
      suggestedWeight: roundToNearestPlate(safeWeight + incrementKg, incrementKg),
      type: "increase"
    };
  }

  return hold(safeWeight, safeSets, "accessory_observe", "完成质量合适，保持当前处方继续巩固。");
}

function hold(weight: number, sets: number, reasonCode: ScientificReviewReasonCode, reason: string): ScientificReview {
  return { advice: "none", reason, reasonCode, suggestedSets: sets, suggestedWeight: weight, type: "hold" };
}

function deload(
  weight: number,
  sets: number,
  increment: number,
  reasonCode: ScientificReviewReasonCode,
  reason: string,
  advice: ScientificReview["advice"]
): ScientificReview {
  return {
    advice,
    reason,
    reasonCode,
    suggestedSets: Math.max(1, sets - 1),
    suggestedWeight: roundToNearestPlate(weight * 0.9, increment),
    type: "deload"
  };
}

function isPositiveWeight(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value: number | null) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isValidRpe(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 10;
}
