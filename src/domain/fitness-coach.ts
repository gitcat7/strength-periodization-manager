import { roundToNearestPlate } from "@/domain/strength";
import { buildScientificReview, type ScientificReviewReasonCode } from "@/domain/scientific-review";

export type RecommendationType = "increase" | "hold" | "decrease" | "deload";

export type CoachSetLog = {
  targetWeight: number;
  targetReps: number;
  actualWeight: number | null;
  actualReps: number | null;
  rpe: number | null;
  completed: boolean;
};

export type ExerciseCoachRecommendation = {
  type: RecommendationType;
  suggestedWeight: number;
  reasonCode?: ScientificReviewReasonCode | "bodyweight_observe";
  reason: string;
};

export function getRecommendationStatusLabel(status: string) {
  if (status === "accepted") return "已更新下次训练";
  if (status === "modified") return "修改后已更新下次训练";
  if (status === "rejected") return "已忽略";
  return "待处理 · 尚未更新下次训练";
}

export function getInterruptionAdvice({
  lastCompletedDate,
  scheduledDate
}: {
  lastCompletedDate?: string | null;
  scheduledDate: string;
}) {
  if (!lastCompletedDate) {
    return {
      action: "优先记录真实重量、次数和 RPE，先建立个人训练基线。",
      basis: "暂无已完成训练记录，当前缺少用于判断恢复与递进的数据。",
      level: "baseline",
      title: "建立训练基线",
      message: "暂无已完成训练记录，当前缺少用于判断恢复与递进的数据。优先记录真实重量、次数和 RPE，先建立个人训练基线。",
      loadMultiplier: 1
    };
  }

  const days = diffDays(lastCompletedDate, scheduledDate);

  if (days < 7) {
    return {
      action: "主项以 RPE 7–8 为上限，保留约 1–2 次 RIR（余力次数）。",
      basis: `训练间隔 ${days} 天，处于常规恢复窗口。`,
      level: "normal",
      title: "可按计划推进",
      message: `训练间隔 ${days} 天，处于常规恢复窗口。主项以 RPE 7–8 为上限，保留约 1–2 次 RIR（余力次数）。`,
      loadMultiplier: 1
    };
  }

  if (days <= 14) {
    return {
      action: "主项较计划下调 10–15%，优先恢复动作质量。",
      basis: `训练间隔 ${days} 天，恢复窗口较常规延长。`,
      level: "caution",
      title: "建议下调训练负荷",
      message: `训练间隔 ${days} 天，恢复窗口较常规延长。主项较计划下调 10–15%，优先恢复动作质量。`,
      loadMultiplier: 0.875
    };
  }

  if (days <= 30) {
    return {
      action: "主项较计划下调 20–30%，增加热身，不急于追求重量。",
      basis: `训练间隔 ${days} 天，近期训练连续性不足。`,
      level: "deload",
      title: "建议恢复或减量",
      message: `训练间隔 ${days} 天，近期训练连续性不足。主项较计划下调 20–30%，增加热身，不急于追求重量。`,
      loadMultiplier: 0.75
    };
  }

  return {
    action: "从保守负荷重新开始，优先确认动作质量与当日体感。",
    basis: `训练间隔 ${days} 天，当前不宜直接恢复原有递进。`,
    level: "restart",
    title: "建议重新建立基线",
    message: `训练间隔 ${days} 天，当前不宜直接恢复原有递进。从保守负荷重新开始，优先确认动作质量与当日体感。`,
    loadMultiplier: 0.65
  };
}

export function getRecommendationPresentation({
  reason,
  suggestedWeight,
  type,
  workout
}: {
  reason: string;
  suggestedWeight: number;
  type: RecommendationType | string;
  workout?: { name: string; scheduledDate: string } | null;
}) {
  const normalizedType = type === "increase_weight" ? "increase" : type === "decrease_weight" ? "decrease" : type;
  const direction =
    normalizedType === "increase"
      ? `小幅加重至 ${suggestedWeight}kg`
      : normalizedType === "decrease"
        ? `建议下调训练负荷至 ${suggestedWeight}kg`
        : normalizedType === "deload"
          ? `建议恢复或减量至 ${suggestedWeight}kg`
          : "保持当前处方并继续记录";

  return {
    basis: reason,
    direction,
    impact: workout ? `${workout.scheduledDate} · ${workout.name} 的后续未完成训练日` : "应用后仅影响后续未完成训练日"
  };
}

export function getWorkoutCoachCue(workoutName: string) {
  if (workoutName.includes("强度")) {
    return "强度日不是力竭日。主项做到 RPE 8 左右，动作速度明显变慢就不要硬顶。";
  }

  if (workoutName.includes("容量")) {
    return "容量日靠稳定总量取胜。重量可以保守一点，目标是每组动作轨迹干净。";
  }

  if (workoutName.includes("有氧")) {
    return "有氧日服务恢复，不和力量训练抢恢复资源。保持能说短句的 Zone 2 强度。";
  }

  return "按计划执行并记录体感。后续调整以真实完成数据为准。";
}

export function summarizeSetLogs(logs: CoachSetLog[]) {
  const completedLogs = logs.filter((log) => log.completed);
  const rpeValues = completedLogs
    .map((log) => log.rpe)
    .filter((rpe): rpe is number => typeof rpe === "number");
  const completionRatio = logs.length > 0 ? completedLogs.length / logs.length : 0;
  const averageRpe = rpeValues.length > 0 ? average(rpeValues) : null;
  const totalTargetReps = logs.reduce((sum, log) => sum + log.targetReps, 0);
  const totalActualReps = completedLogs.reduce((sum, log) => sum + (log.actualReps ?? 0), 0);

  return {
    averageRpe,
    completionRatio,
    completedSets: completedLogs.length,
    totalSets: logs.length,
    totalActualReps,
    totalTargetReps
  };
}

export function buildExerciseCoachRecommendation({
  exerciseName,
  increment,
  isMainLift = false,
  logs,
  daysSincePreviousTraining,
  nutrition,
  bodyweightChangePercent,
  recovery,
  targetWeight
}: {
  bodyweightChangePercent?: number | null;
  daysSincePreviousTraining?: number | null;
  nutrition?: "adequate" | "poor" | null;
  recovery?: "normal" | "poor" | null;
  exerciseName: string;
  increment: number;
  isMainLift?: boolean;
  logs: CoachSetLog[];
  targetWeight: number;
}): ExerciseCoachRecommendation {
  if (targetWeight <= 0) {
    return {
      type: "hold",
      suggestedWeight: 0,
      reasonCode: "bodyweight_observe",
      reason: `${exerciseName} 不按 kg 递进，先保持当前安排，记录完成时间和体感。`
    };
  }

  const review = buildScientificReview({
    bodyweightChangePercent,
    daysSincePreviousTraining,
    increment,
    isMainLift,
    logs,
    nutrition,
    recovery,
    targetSets: logs.length,
    targetWeight
  });
  return { type: review.type, suggestedWeight: review.suggestedWeight, reasonCode: review.reasonCode, reason: `${exerciseName}：${review.reason}` };
}

function diffDays(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / msPerDay));
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
