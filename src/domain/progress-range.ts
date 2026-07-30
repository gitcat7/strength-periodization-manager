export type ProgressRangeWeeks = 4 | 8 | 12;

export const progressRangeOptions: ProgressRangeWeeks[] = [4, 8, 12];

export function isDateInProgressRange(
  isoDate: string,
  weeks: ProgressRangeWeeks,
  referenceDate = new Date()
) {
  const end = new Date(referenceDate);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - weeks * 7 + 1);
  start.setHours(0, 0, 0, 0);
  const value = new Date(`${isoDate}T12:00:00`);
  return value >= start && value <= end;
}

export function formatPeriodChange(current: number, previous: number) {
  if (previous <= 0) return "暂无上周基线";
  const percent = ((current - previous) / previous) * 100;
  return `较上周 ${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}
