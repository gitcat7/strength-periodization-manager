import { roundToNearestPlate } from "@/domain/strength";

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
  reason: string;
};

export function getInterruptionAdvice({
  lastCompletedDate,
  scheduledDate
}: {
  lastCompletedDate?: string | null;
  scheduledDate: string;
}) {
  if (!lastCompletedDate) {
    return {
      level: "baseline",
      title: "建立基线",
      message: "暂无已完成训练记录。今天优先记录真实重量、次数和 RPE，先把个人基线建起来。",
      loadMultiplier: 1
    };
  }

  const days = diffDays(lastCompletedDate, scheduledDate);

  if (days < 7) {
    return {
      level: "normal",
      title: "正常推进",
      message: `距离上次完成训练 ${days} 天，可以按计划执行，主项保留 1-2 次余量。`,
      loadMultiplier: 1
    };
  }

  if (days <= 14) {
    return {
      level: "caution",
      title: "小幅恢复",
      message: `已经间隔 ${days} 天，建议主项比计划降低 10-15%，先找回动作质量。`,
      loadMultiplier: 0.875
    };
  }

  if (days <= 30) {
    return {
      level: "deload",
      title: "恢复训练",
      message: `已经间隔 ${days} 天，建议降低 20-30%，增加热身，不急着冲重量。`,
      loadMultiplier: 0.75
    };
  }

  return {
    level: "restart",
    title: "重新激活",
    message: `已经间隔 ${days} 天，今天按重新建立基线处理，动作质量优先于重量。`,
    loadMultiplier: 0.65
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
  logs,
  targetWeight
}: {
  exerciseName: string;
  increment: number;
  logs: CoachSetLog[];
  targetWeight: number;
}): ExerciseCoachRecommendation {
  const summary = summarizeSetLogs(logs);
  const plateIncrement = increment > 0 ? increment : 2.5;

  if (targetWeight <= 0) {
    return {
      type: "hold",
      suggestedWeight: 0,
      reason: `${exerciseName} 不按 kg 递进，先保持当前安排，记录完成时间和体感。`
    };
  }

  if (summary.completionRatio <= 0.5) {
    return {
      type: "deload",
      suggestedWeight: roundToNearestPlate(targetWeight * 0.9, plateIncrement),
      reason: `${exerciseName} 完成组数不足一半，下次先降重约 10%，把动作质量找回来。`
    };
  }

  if (summary.completionRatio < 1) {
    return {
      type: "hold",
      suggestedWeight: targetWeight,
      reason: `${exerciseName} 本次没有全部完成，下次先保持重量，目标是补齐计划组数。`
    };
  }

  if (summary.averageRpe === null) {
    return {
      type: "hold",
      suggestedWeight: targetWeight,
      reason: `${exerciseName} 已完成，但缺少 RPE。先保持重量，再记录体感用于下次判断。`
    };
  }

  if (summary.averageRpe >= 9.5) {
    return {
      type: "decrease",
      suggestedWeight: roundToNearestPlate(targetWeight - plateIncrement, plateIncrement),
      reason: `${exerciseName} 平均 RPE ${summary.averageRpe.toFixed(1)} 偏高，下次降一档，避免恢复被打穿。`
    };
  }

  if (summary.averageRpe >= 8.5) {
    return {
      type: "hold",
      suggestedWeight: targetWeight,
      reason: `${exerciseName} 平均 RPE ${summary.averageRpe.toFixed(1)}，刺激足够，下次先保持重量。`
    };
  }

  if (summary.averageRpe <= 7.5) {
    return {
      type: "increase",
      suggestedWeight: roundToNearestPlate(targetWeight + plateIncrement, plateIncrement),
      reason: `${exerciseName} 全部完成且平均 RPE ${summary.averageRpe.toFixed(1)}，下次可小幅加重。`
    };
  }

  return {
    type: "hold",
    suggestedWeight: targetWeight,
    reason: `${exerciseName} 完成质量合适，继续按当前重量巩固。`
  };
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
