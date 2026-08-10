export type HistoryCalendarState = "completed" | "scheduled" | "rest" | "empty";

export type HistoryCalendarEntry = {
  day_type: "training" | "rest";
  id: string;
  name: string;
  scheduled_date: string;
  status: string;
  volume: number;
};

export type HistoryCalendarDay = {
  date: string;
  entries: HistoryCalendarEntry[];
  inCurrentMonth: boolean;
  selected: boolean;
  state: HistoryCalendarState;
  volume: number;
};

export function buildHistoryCalendarDays({
  month,
  selectedDate,
  workouts
}: {
  month: string;
  selectedDate: string;
  workouts: HistoryCalendarEntry[];
}): HistoryCalendarDay[] {
  const monthStart = parseMonth(month);
  const firstWeekday = (monthStart.getUTCDay() + 6) % 7;
  const firstDay = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1 - firstWeekday));
  const entriesByDate = new Map<string, HistoryCalendarEntry[]>();

  workouts.forEach((workout) => {
    entriesByDate.set(workout.scheduled_date, [...(entriesByDate.get(workout.scheduled_date) ?? []), workout]);
  });

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(firstDay);
    current.setUTCDate(firstDay.getUTCDate() + index);
    const date = formatDate(current);
    const entries = entriesByDate.get(date) ?? [];
    const completedEntries = entries.filter((entry) => entry.day_type === "training" && entry.status === "completed");
    const scheduledEntries = entries.filter((entry) => entry.day_type === "training" && entry.status !== "completed");
    const restEntries = entries.filter((entry) => entry.day_type === "rest");

    return {
      date,
      entries,
      inCurrentMonth: current.getUTCMonth() === monthStart.getUTCMonth(),
      selected: date === selectedDate,
      state: completedEntries.length > 0 ? "completed" : scheduledEntries.length > 0 ? "scheduled" : restEntries.length > 0 ? "rest" : "empty",
      volume: completedEntries.reduce((total, entry) => total + entry.volume, 0)
    };
  });
}

export function getMonthLabel(month: string) {
  const date = parseMonth(month);
  return `${date.getUTCFullYear()} 年 ${date.getUTCMonth() + 1} 月`;
}

export function shiftCalendarMonth(month: string, direction: -1 | 1) {
  const date = parseMonth(month);
  date.setUTCMonth(date.getUTCMonth() + direction);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1));
}

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
