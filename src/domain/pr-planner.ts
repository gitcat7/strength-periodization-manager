import { roundToNearestPlate } from "@/domain/strength";

export type PrPhase = "base" | "specific" | "taper" | "test" | "overdue";
export type PrGoalAssessmentLevel = "conservative" | "reasonable" | "aggressive" | "overdue";

export type PrGoalAssessment = {
  level: PrGoalAssessmentLevel;
  label: string;
  message: string;
  ratio: number;
};

export function getDaysUntilTarget(targetDate: string, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(`${targetDate}T00:00:00`).getTime();
  return Math.ceil((target - today) / 86_400_000);
}

export function getPrPhase(daysUntilTarget: number): PrPhase {
  if (daysUntilTarget < 0) return "overdue";
  if (daysUntilTarget <= 1) return "test";
  if (daysUntilTarget <= 7) return "taper";
  if (daysUntilTarget <= 21) return "specific";
  return "base";
}

export function getPrPhaseLabel(phase: PrPhase) {
  if (phase === "base") return "基础推进";
  if (phase === "specific") return "专项强化";
  if (phase === "taper") return "测试前减量";
  if (phase === "test") return "PR 测试日";
  return "目标已过期";
}

export function getPrPhaseAdvice(phase: PrPhase) {
  if (phase === "base") {
    return "保持正常训练节奏，主项逐步提高强度，辅助动作继续积累稳定容量。";
  }

  if (phase === "specific") {
    return "减少无关疲劳，提高主项特异性。重组保留 1-2 次余量，不在训练中硬冲极限。";
  }

  if (phase === "taper") {
    return "减少总组数，保留动作速度和技术感觉。睡眠、热身和恢复优先级高于加练。";
  }

  if (phase === "test") {
    return "充分热身，第一把选择稳妥重量，第二把冲目标，第三把只在状态很好时尝试。";
  }

  return "目标日期已经过去。建议根据最近训练表现更新目标日期或标记完成。";
}

export function buildAttemptPlan(currentEstimatedOneRm: number, targetWeight: number, increment: number) {
  const openerBase = Math.min(currentEstimatedOneRm * 0.92, targetWeight * 0.92);
  const opener = roundToNearestPlate(openerBase, increment);
  const second = roundToNearestPlate(targetWeight, increment);
  const thirdBase = Math.max(targetWeight + increment, targetWeight * 1.025);
  const third = roundToNearestPlate(thirdBase, increment);

  return [
    {
      label: "第一把",
      weight: opener,
      note: "稳妥成功，建立信心。"
    },
    {
      label: "第二把",
      weight: second,
      note: "目标 PR，动作速度正常再上。"
    },
    {
      label: "第三把",
      weight: third,
      note: "只在第二把很稳时尝试。"
    }
  ];
}

export function assessPrGoal({
  currentEstimatedOneRm,
  daysUntilTarget,
  targetWeight
}: {
  currentEstimatedOneRm: number;
  daysUntilTarget: number;
  targetWeight: number;
}): PrGoalAssessment {
  const ratio = currentEstimatedOneRm > 0 ? targetWeight / currentEstimatedOneRm : 0;

  if (daysUntilTarget < 0) {
    return {
      level: "overdue",
      label: "目标已过期",
      message: "目标日期已经过去。建议标记完成、取消，或根据最近训练表现重新设置日期。",
      ratio
    };
  }

  if (ratio <= 1.02) {
    return {
      level: "conservative",
      label: "偏保守",
      message: "目标接近当前估算 1RM，适合先建立成功记录；如果近期训练状态很好，可以考虑略微上调。",
      ratio
    };
  }

  if (ratio <= 1.08 && daysUntilTarget >= 21) {
    return {
      level: "reasonable",
      label: "合理目标",
      message: "目标增幅和准备时间匹配。保持当前周期推进，测试前一周注意减量和恢复。",
      ratio
    };
  }

  if (ratio <= 1.05 && daysUntilTarget >= 7) {
    return {
      level: "reasonable",
      label: "合理目标",
      message: "目标增幅不大，剩余时间足够做一次专项准备。注意不要在训练中提前硬冲。",
      ratio
    };
  }

  return {
    level: "aggressive",
    label: "偏激进",
    message: "目标相对当前估算 1RM 或剩余准备时间偏激进。建议保守安排第一把，训练中以动作速度和恢复为准。",
    ratio
  };
}

export function getDefaultTargetDate(now = new Date()) {
  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + 42);
  return formatDate(targetDate);
}

export function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
