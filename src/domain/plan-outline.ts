export type PlanOutlineWorkout = {
  day_type: "training" | "rest";
  id: string;
  name: string;
  schedule_index: number;
  sequence_index: number | null;
  scheduled_date: string;
  status: string;
};

export type PlanOutline = ReturnType<typeof groupPlanOutline>;

export type DefaultPlanPosition = {
  cycleIndex: number | null;
  week: number;
};

export function groupPlanOutline(workouts: PlanOutlineWorkout[], startDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const sorted = [...workouts].sort((a, b) => a.schedule_index - b.schedule_index);
  const weeks = new Map<number, PlanOutlineWorkout[]>();
  sorted.forEach((workout) => {
    const day = new Date(`${workout.scheduled_date}T00:00:00`);
    const week = Math.max(1, Math.floor((day.getTime() - start.getTime()) / 86400000 / 7) + 1);
    weeks.set(week, [...(weeks.get(week) ?? []), workout]);
  });
  return [...weeks].map(([week, items]) => ({
    week,
    startDate: items[0]?.scheduled_date ?? startDate,
    endDate: items.at(-1)?.scheduled_date ?? startDate,
    ...getTrainingDaySummary(items),
    cycles: groupCycles(items)
  }));
}

export function getDefaultPlanPosition(
  outline: PlanOutline,
  startDate: string,
  now: Date
): DefaultPlanPosition {
  const start = new Date(`${startDate}T00:00:00`);
  const currentWeek = Math.max(
    1,
    Math.floor((now.getTime() - start.getTime()) / 86_400_000 / 7) + 1
  );
  const calendarWeek = outline.find((item) => item.week === currentWeek);
  const unfinishedWeek = outline.find(
    (item) => item.completedTrainingDays < item.totalTrainingDays
  );
  const selectedWeek = calendarWeek && calendarWeek.totalTrainingDays > 0
    ? calendarWeek
    : unfinishedWeek ?? calendarWeek ?? outline.at(-1);
  const unfinishedCycle = selectedWeek?.cycles.find(
    (cycle) => cycle.completedTrainingDays < cycle.totalTrainingDays
  );

  return {
    week: selectedWeek?.week ?? 1,
    cycleIndex: unfinishedCycle?.index ?? selectedWeek?.cycles.at(-1)?.index ?? null
  };
}

function groupCycles(workouts: PlanOutlineWorkout[]) {
  const cycles: PlanOutlineWorkout[][] = [];
  let current: PlanOutlineWorkout[] = [];
  workouts.forEach((workout) => {
    if (workout.day_type === "training" && current.some((item) => item.day_type === "training" && item.name === workout.name)) {
      cycles.push(current);
      current = [];
    }
    current.push(workout);
  });
  if (current.length > 0) cycles.push(current);
  return cycles.map((items, index) => ({
    index: index + 1,
    label: items
      .filter((item) => item.day_type === "training")
      .map((item) => item.name)
      .join(" → ") || "恢复安排",
    startDate: items[0]?.scheduled_date ?? "",
    endDate: items.at(-1)?.scheduled_date ?? "",
    ...getTrainingDaySummary(items),
    workouts: items
  }));
}

function getTrainingDaySummary(workouts: PlanOutlineWorkout[]) {
  const trainingDays = workouts.filter((workout) => workout.day_type === "training");
  return {
    completedTrainingDays: trainingDays.filter((workout) => workout.status === "completed").length,
    totalTrainingDays: trainingDays.length
  };
}
