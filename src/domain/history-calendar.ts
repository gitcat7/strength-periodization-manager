export type CalendarWorkout = {
  id: string;
  scheduledDate: string;
  status: string;
  dayType: "training" | "rest";
  completedVolume: number;
};

export type CalendarDay = {
  date: string;
  inMonth: boolean;
  workouts: CalendarWorkout[];
  completedVolume: number;
  status: "empty" | "planned" | "completed" | "rest";
};

type HistoryDetailWorkout = {
  id: string;
  scheduled_date: string;
  status: string;
};

export function buildHistoryCalendarDays(month: Date, workouts: CalendarWorkout[]): CalendarDay[] {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const firstDayOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstDayOffset);
  const workoutsByDate = new Map<string, CalendarWorkout[]>();

  for (const workout of workouts) {
    workoutsByDate.set(workout.scheduledDate, [...(workoutsByDate.get(workout.scheduledDate) ?? []), workout]);
  }

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const dateKey = formatDate(date);
    const dayWorkouts = workoutsByDate.get(dateKey) ?? [];
    const completedTraining = dayWorkouts.filter((workout) => workout.status === "completed" && workout.dayType === "training");
    const completedRest = dayWorkouts.some((workout) => workout.status === "completed" && workout.dayType === "rest");
    const hasPlanned = dayWorkouts.some((workout) => workout.status !== "completed");

    return {
      date: dateKey,
      inMonth: date.getMonth() === firstOfMonth.getMonth(),
      workouts: dayWorkouts,
      completedVolume: completedTraining.reduce((sum, workout) => sum + Math.max(0, workout.completedVolume), 0),
      status: completedTraining.length > 0 ? "completed" : completedRest ? "rest" : hasPlanned ? "planned" : "empty"
    };
  });
}

export function selectHistoryDetailWorkouts<T extends HistoryDetailWorkout>(
  selectedDate: string | null,
  calendarDays: readonly CalendarDay[],
  workouts: readonly T[]
): T[] {
  if (!selectedDate) return [];

  const selectedDay = calendarDays.find((day) => day.date === selectedDate);
  if (!selectedDay) return [];

  const selectedCompletedIds = new Set(
    selectedDay.workouts.filter((workout) => workout.status === "completed").map((workout) => workout.id)
  );
  return workouts.filter((workout) => selectedCompletedIds.has(workout.id));
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
