"use client";

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

import {
  buildHistoryCalendarDays,
  getMonthLabel,
  shiftCalendarMonth,
  type HistoryCalendarEntry,
  type HistoryCalendarState
} from "@/domain/history-calendar";

const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];

type HistoryCalendarProps = {
  entries: HistoryCalendarEntry[];
  month: string;
  onMonthChange: (month: string) => void;
  onSelectedDateChange: (date: string) => void;
  selectedDate: string;
};

export function HistoryCalendar({
  entries,
  month,
  onMonthChange,
  onSelectedDateChange,
  selectedDate
}: HistoryCalendarProps) {
  const days = buildHistoryCalendarDays({ month, selectedDate, workouts: entries });
  const currentMonth = getCurrentMonth();

  return (
    <section aria-label="训练月历" className="rounded-xl border border-line bg-white p-3 sm:p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          aria-label={`查看 ${formatMonthForAria(shiftCalendarMonth(month, -1))}`}
          className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-ink"
          onClick={() => onMonthChange(shiftCalendarMonth(month, -1))}
          type="button"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <p className="text-xs text-muted">训练历史</p>
          <h2 className="font-semibold">{getMonthLabel(month)}</h2>
        </div>
        <button
          aria-label={`查看 ${formatMonthForAria(shiftCalendarMonth(month, 1))}`}
          className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-ink"
          onClick={() => onMonthChange(shiftCalendarMonth(month, 1))}
          type="button"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 text-center text-xs font-medium text-muted">
        {weekdayLabels.map((weekday) => <span className="py-1" key={weekday}>{weekday}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => (
          <button
            aria-label={getDayAriaLabel(day.date, day.state, day.volume, day.entries.map((entry) => entry.name))}
            className={`min-h-[4.6rem] rounded-lg border p-1 text-left transition active:scale-[0.98] ${getDayClassName(day.state, day.inCurrentMonth, day.selected)}`}
            key={day.date}
            onClick={() => onSelectedDateChange(day.date)}
            type="button"
          >
            <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${day.selected ? "bg-action text-white" : ""}`}>
              {Number(day.date.slice(-2))}
            </span>
            <DayBadge state={day.state} volume={day.volume} />
            {day.entries.length > 0 ? <p className="mt-1 line-clamp-2 text-[10px] leading-3">{day.entries[0].name}</p> : null}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          aria-label="返回本月"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink"
          disabled={month === currentMonth}
          onClick={() => onMonthChange(currentMonth)}
          type="button"
        >
          <RotateCcw size={15} />
          本月
        </button>
        <button
          aria-label="全部历史"
          className="h-10 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!selectedDate}
          onClick={() => onSelectedDateChange("")}
          type="button"
        >
          全部历史
        </button>
      </div>
    </section>
  );
}

function DayBadge({ state, volume }: { state: HistoryCalendarState; volume: number }) {
  if (state === "completed") return <span className="mt-1 block truncate rounded bg-action px-1 py-0.5 text-center text-[10px] font-semibold text-white">{Math.round(volume).toLocaleString()}kg</span>;
  if (state === "scheduled") return <span className="mt-1 block rounded bg-blue-50 px-1 py-0.5 text-center text-[10px] font-semibold text-blue-700">待训练</span>;
  if (state === "rest") return <span className="mt-1 block rounded bg-slate-100 px-1 py-0.5 text-center text-[10px] font-semibold text-slate-600">休息</span>;
  return null;
}

function getDayClassName(state: HistoryCalendarState, inCurrentMonth: boolean, selected: boolean) {
  const visibility = inCurrentMonth ? "text-ink" : "border-transparent bg-transparent text-muted/50";
  if (selected) return `${visibility} border-action ring-1 ring-action/40`;
  if (state === "completed") return `${visibility} border-action/30 bg-action/5`;
  if (state === "scheduled") return `${visibility} border-blue-200 bg-blue-50/50`;
  if (state === "rest") return `${visibility} border-slate-200 bg-slate-50`;
  return `${visibility} border-transparent`;
}

function getDayAriaLabel(date: string, state: HistoryCalendarState, volume: number, names: string[]) {
  const labels: Record<HistoryCalendarState, string> = {
    completed: "已完成训练",
    empty: "无训练安排",
    rest: "休息日",
    scheduled: "待训练"
  };
  const volumeLabel = state === "completed" ? `，${Math.round(volume).toLocaleString()} kg` : "";
  const nameLabel = names.length > 0 ? `，${names.join("、")}` : "";
  return `${formatDateForAria(date)}，${labels[state]}${volumeLabel}${nameLabel}`;
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateForAria(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function formatMonthForAria(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}年${monthNumber}月`;
}
