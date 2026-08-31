import type { PauseReason } from "./schedule-adjustment";

const pauseReasonLabels: Record<PauseReason, string> = {
  fatigue: "疲劳累积，需要休整",
  injury: "受伤",
  minor_discomfort: "轻微不适",
  other: "其他原因",
  personal: "个人事务",
  time_conflict: "工作/学习时间冲突"
};

export function buildPlanPausePresentation({
  effectiveDate,
  nextTraining,
  reason,
  resumeDate,
  today
}: {
  effectiveDate: string;
  nextTraining: { focus: string; name: string } | null;
  reason: PauseReason | null;
  resumeDate: string | null;
  today: string;
}) {
  const elapsedDays = Math.max(0, daysBetween(effectiveDate, today));

  return {
    canResume: Boolean(nextTraining),
    nextTrainingLabel: nextTraining ? `${nextTraining.name} · ${nextTraining.focus}` : null,
    noPendingReason: nextTraining ? null : "当前周期没有待恢复训练日，无法恢复日程。",
    pausedDayLabel: `暂停第 ${elapsedDays + 1} 天`,
    reasonLabel: reason ? (pauseReasonLabels[reason] ?? "未说明原因") : "未说明原因",
    resumeDateLabel: resumeDate ? `预计恢复日期：${resumeDate}` : "未设置恢复日期",
    resumeDatePassed: Boolean(resumeDate && resumeDate < today)
  };
}

function daysBetween(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00`).getTime();
  const to = new Date(`${toDate}T00:00:00`).getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}
