import { useMemo } from "react";

import {
  cadencePresets,
  getScheduleDensity,
  validateScheduleRule,
  weekdayPresets,
  type HolidayPolicy,
  type ScheduleRule
} from "@/domain/schedule-rule";
import {
  buildSequenceCalendar,
  getTargetTrainingCount,
  type CalendarScheduleItem
} from "@/domain/sequence-calendar";

const weekdayOptions = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 0, label: "周日" }
];

export function ScheduleRuleFields({
  holidayPolicy = "train",
  holidays = [],
  onChange,
  onHolidayPolicyChange,
  previewStartDate,
  value
}: {
  holidayPolicy?: HolidayPolicy;
  holidays?: Array<{ date: string; name: string }>;
  onChange: (rule: ScheduleRule) => void;
  onHolidayPolicyChange?: (policy: HolidayPolicy) => void;
  previewStartDate?: string;
  value: ScheduleRule;
}) {
  const errors = validateScheduleRule(value);
  const isValid = Object.keys(errors).length === 0;

  const preview = useMemo(() => {
    if (!isValid) return { density: 0, endDate: "", items: [] as CalendarScheduleItem[] };
    const startDate = previewStartDate ?? formatLocalDate(new Date());
    const constraints =
      holidayPolicy === "rest_and_shift"
        ? holidays.map((holiday) => ({
            date: holiday.date,
            kind: "holiday" as const,
            allowsTraining: false,
            label: holiday.name
          }))
        : [];
    // Five weeks of targets guarantee the calendar covers the full 28-day window
    // even when rests or holidays land near the end of the preview.
    const targetTrainingCount = getTargetTrainingCount({ startDate, trainingWeeks: 5, rule: value });
    const items = buildSequenceCalendar({
      startDate,
      targetTrainingCount,
      rule: value,
      constraints
    }).slice(0, 28);
    return { density: getScheduleDensity(value), endDate: items.at(-1)?.scheduledDate ?? "", items };
  }, [holidayPolicy, holidays, isValid, previewStartDate, value]);

  return (
    <div>
      <span className="mb-1 block text-sm font-medium">安排方式</span>
      <div className="flex flex-wrap gap-2" role="group">
        <button
          className={`rounded-full px-3 py-2 text-sm font-semibold ${value.mode === "cadence" ? "bg-action text-white" : "border border-line bg-field text-ink"}`}
          onClick={() => onChange({ mode: "cadence", trainDays: 3, restDays: 1 })}
          type="button"
        >
          练休循环
        </button>
        <button
          className={`rounded-full px-3 py-2 text-sm font-semibold ${value.mode === "fixed_weekdays" ? "bg-action text-white" : "border border-line bg-field text-ink"}`}
          onClick={() => onChange({ mode: "fixed_weekdays", weekdays: [1, 3, 5] })}
          type="button"
        >
          固定星期
        </button>
      </div>

      {value.mode === "cadence" ? (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            {cadencePresets.map((preset) => {
              const active = preset.trainDays === value.trainDays && preset.restDays === value.restDays;
              return (
                <button
                  className={`rounded-full px-3 py-2 text-sm font-semibold ${active ? "bg-action text-white" : "border border-line bg-field text-ink"}`}
                  key={preset.id}
                  onClick={() =>
                    onChange({ mode: "cadence", trainDays: preset.trainDays ?? 1, restDays: preset.restDays ?? 1 })
                  }
                  type="button"
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">连续训练天数</span>
              <select
                aria-label="连续训练天数"
                className="h-11 w-full rounded-lg border border-line bg-field px-3 text-sm"
                onChange={(event) =>
                  onChange({ mode: "cadence", trainDays: Number(event.target.value), restDays: value.restDays })
                }
                value={value.trainDays}
              >
                {[1, 2, 3, 4, 5, 6].map((days) => (
                  <option key={days} value={days}>{days} 天</option>
                ))}
              </select>
              {errors.trainDays ? <p className="mt-1 text-xs text-red-600">{errors.trainDays}</p> : null}
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">连续休息天数</span>
              <select
                aria-label="连续休息天数"
                className="h-11 w-full rounded-lg border border-line bg-field px-3 text-sm"
                onChange={(event) =>
                  onChange({ mode: "cadence", trainDays: value.trainDays, restDays: Number(event.target.value) })
                }
                value={value.restDays}
              >
                {[1, 2, 3].map((days) => (
                  <option key={days} value={days}>{days} 天</option>
                ))}
              </select>
              {errors.restDays ? <p className="mt-1 text-xs text-red-600">{errors.restDays}</p> : null}
            </label>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            {weekdayPresets.map((preset) => (
              <button
                className="rounded-full border border-line bg-field px-3 py-2 text-sm font-semibold text-ink"
                key={preset.id}
                onClick={() => onChange({ mode: "fixed_weekdays", weekdays: [...(preset.weekdays ?? [])] })}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {weekdayOptions.map((weekday) => {
              const active = value.weekdays.includes(weekday.value);
              return (
                <button
                  className={`rounded-full px-3 py-2 text-sm font-semibold ${active ? "bg-action text-white" : "border border-line bg-field text-ink"}`}
                  key={weekday.value}
                  onClick={() =>
                    onChange({
                      mode: "fixed_weekdays",
                      weekdays: active
                        ? value.weekdays.filter((day) => day !== weekday.value)
                        : [...value.weekdays, weekday.value].sort((a, b) => a - b)
                    })
                  }
                  type="button"
                >
                  {weekday.label}
                </button>
              );
            })}
          </div>
          {errors.weekdays ? <p className="mt-1 text-xs text-red-600">{errors.weekdays}</p> : null}
        </div>
      )}

      {onHolidayPolicyChange ? (
        <label className="mt-4 block max-w-md">
          <span className="mb-1 block text-sm font-medium">节假日安排</span>
          <select
            aria-label="节假日安排"
            className="h-11 w-full rounded-lg border border-line bg-field px-3 text-sm"
            onChange={(event) => onHolidayPolicyChange(event.target.value as HolidayPolicy)}
            value={holidayPolicy}
          >
            <option value="train">节假日照常训练</option>
            <option value="rest_and_shift">节假日休息并顺延</option>
          </select>
        </label>
      ) : null}

      {isValid ? (
        <div className="mt-4 rounded-lg bg-field p-3">
          <p className="text-sm font-semibold">28 天预览</p>
          <p className="mt-1 text-xs text-muted">
            每周 {formatDensity(preview.density)} 次训练 · 预计结束于 {preview.endDate}
          </p>
          <div className="mt-2 grid grid-cols-4 gap-1 sm:grid-cols-7">
            {preview.items.map((item) => (
              <span
                className={`rounded px-1.5 py-1 text-center text-[11px] leading-4 ${
                  item.dayType === "training"
                    ? "bg-action/10 font-semibold text-action"
                    : item.blockedReasons.length > 0
                      ? "bg-amber-100 text-amber-800"
                      : "bg-white text-muted"
                }`}
                key={item.scheduleIndex}
              >
                {formatMonthDay(item.scheduledDate)} {getItemLabel(item)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getItemLabel(item: CalendarScheduleItem): string {
  if (item.dayType === "training") return "训练";
  return item.blockedReasons.length > 0 ? item.blockedReasons.join("、") : "计划休息";
}

function formatDensity(density: number): string {
  return String(Number(density.toFixed(2)));
}

function formatMonthDay(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
