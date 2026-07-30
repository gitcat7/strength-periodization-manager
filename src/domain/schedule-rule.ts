export type SupportedScheduleMode = "cadence" | "fixed_weekdays";

export type ScheduleRule =
  | { mode: "cadence"; trainDays: number; restDays: number }
  | { mode: "fixed_weekdays"; weekdays: number[] };

export type HolidayPolicy = "train" | "rest_and_shift";

export type SchedulePreset = {
  id: string;
  label: string;
  mode: SupportedScheduleMode;
  trainDays?: number;
  restDays?: number;
  weekdays?: number[];
};

export const cadencePresets: readonly SchedulePreset[] = [
  { id: "cadence-1-1", label: "练一休一", mode: "cadence", trainDays: 1, restDays: 1 },
  { id: "cadence-2-1", label: "练二休一", mode: "cadence", trainDays: 2, restDays: 1 },
  { id: "cadence-3-1", label: "练三休一", mode: "cadence", trainDays: 3, restDays: 1 },
  { id: "cadence-3-2", label: "练三休二", mode: "cadence", trainDays: 3, restDays: 2 }
];

export const weekdayPresets: readonly SchedulePreset[] = [
  { id: "weekday-training-weekend-rest", label: "工作日训练、周末双休", mode: "fixed_weekdays", weekdays: [1, 2, 3, 4, 5] },
  { id: "monday-wednesday-friday", label: "周一、三、五", mode: "fixed_weekdays", weekdays: [1, 3, 5] },
  { id: "tuesday-thursday-saturday", label: "周二、四、六", mode: "fixed_weekdays", weekdays: [2, 4, 6] }
];

export function validateScheduleRule(rule: ScheduleRule): Record<string, string> {
  if (rule.mode === "cadence") {
    const errors: Record<string, string> = {};
    if (!Number.isInteger(rule.trainDays) || rule.trainDays < 1 || rule.trainDays > 6) {
      errors.trainDays = "连续训练天数应为 1–6 天";
    }
    if (!Number.isInteger(rule.restDays) || rule.restDays < 1 || rule.restDays > 3) {
      errors.restDays = "连续休息天数应为 1–3 天";
    }
    return errors;
  }

  if (rule.weekdays.length === 0) {
    return { weekdays: "请至少选择一个星期" };
  }
  if (rule.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    return { weekdays: "星期选择应在 0–6 之间" };
  }
  if (new Set(rule.weekdays).size !== rule.weekdays.length) {
    return { weekdays: "星期选择不能重复" };
  }
  return {};
}

export function getScheduleDensity(rule: ScheduleRule): number {
  if (rule.mode === "cadence") {
    return (rule.trainDays / (rule.trainDays + rule.restDays)) * 7;
  }
  return rule.weekdays.length;
}

export function getScheduleRuleLabel(rule: ScheduleRule): string {
  if (rule.mode === "cadence") {
    return `练${toChineseNumeral(rule.trainDays)}休${toChineseNumeral(rule.restDays)}`;
  }

  const sorted = [...rule.weekdays].sort((a, b) => a - b);
  const preset = weekdayPresets.find(
    (candidate) =>
      candidate.weekdays?.length === sorted.length &&
      [...candidate.weekdays].sort((a, b) => a - b).every((day, index) => day === sorted[index])
  );
  if (preset) return preset.label;

  const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
  return sorted.map((day) => `周${dayNames[day]}`).join("、");
}

function toChineseNumeral(value: number): string {
  return ["零", "一", "二", "三", "四", "五", "六"][value] ?? String(value);
}
