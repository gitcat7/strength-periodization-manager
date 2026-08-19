import { getTargetTrainingCount } from "@/domain/sequence-calendar";
import type { ScheduleRule } from "@/domain/schedule-rule";

export type PlanOutlineWorkout = {
  day_type: "training" | "rest";
  id: string;
  name: string;
  schedule_index: number;
  sequence_index: number | null;
  scheduled_date: string;
  status: string;
  cycle_index?: number | null;
  cycle_position?: number | null;
  prescription_revision?: number | null;
  completed_set_count?: number;
};

export type PlanOutline = ReturnType<typeof groupPlanOutline>;

export type DefaultPlanPosition = {
  cycleIndex: number | null;
  week: number;
};

type PositionedWorkout = {
  workout: PlanOutlineWorkout;
  week: number;
  cycleIndex: number | null;
  deferred: boolean;
};

export type PlanProgressConfig = {
  scheduleRule?: ScheduleRule | null;
  totalWeeks: number;
  trainingDaysPerWeek?: number;
};

export function groupPlanOutline(
  workouts: PlanOutlineWorkout[],
  startDate: string,
  progress?: number | PlanProgressConfig
) {
  const sorted = [...workouts].sort((a, b) => a.schedule_index - b.schedule_index);
  if (sorted.length === 0) return [];
  if (!progress || (typeof progress === "number" && progress < 1)) {
    return groupLegacyCalendarOutline(sorted, startDate);
  }

  const configured = typeof progress === "number" ? null : normalizeProgressConfig(progress);
  const positioned = configured
    ? positionByConfiguredProgress(sorted, startDate, configured)
    : positionByTrainingProgress(sorted, progress as number);
  const weeks = new Map<number, PositionedWorkout[]>();
  if (configured) {
    for (let week = 1; week <= configured.totalWeeks; week += 1) weeks.set(week, []);
  }
  for (const item of positioned) {
    weeks.set(item.week, [...(weeks.get(item.week) ?? []), item]);
  }

  return [...weeks.entries()]
    .sort(([left], [right]) => left - right)
    .map(([week, items]) => {
      const weekWorkouts = items.map((item) => item.workout);
      return {
        week,
        calendarWeekLabel: getCalendarWeekLabel(weekWorkouts, startDate),
        startDate: weekWorkouts[0]?.scheduled_date ?? startDate,
        endDate: weekWorkouts.at(-1)?.scheduled_date ?? startDate,
        ...getTrainingDaySummary(weekWorkouts),
        deferredTrainingDays: items.filter((item) => item.deferred && item.workout.day_type === "training").length,
        cycles: groupMetadataCycles(items)
      };
    });
}

export function getDefaultPlanPosition(
  outline: PlanOutline,
  _startDate: string,
  _now: Date
): DefaultPlanPosition {
  const selectedWeek = outline.find(
    (item) => item.completedTrainingDays < item.totalTrainingDays
  ) ?? outline.at(-1);
  const unfinishedCycle = selectedWeek?.cycles.find(
    (cycle) => cycle.completedTrainingDays < cycle.totalTrainingDays
  );

  return {
    week: selectedWeek?.week ?? 1,
    cycleIndex: unfinishedCycle?.index ?? selectedWeek?.cycles.at(-1)?.index ?? null
  };
}

function positionByTrainingProgress(workouts: PlanOutlineWorkout[], trainingDaysPerWeek: number): PositionedWorkout[] {
  return positionWithResolver(workouts, (sequenceIndex) => ({
    deferred: false,
    week: Math.floor(sequenceIndex / trainingDaysPerWeek) + 1
  }));
}

function positionByConfiguredProgress(
  workouts: PlanOutlineWorkout[],
  startDate: string,
  config: Required<Pick<PlanProgressConfig, "totalWeeks">> & Omit<PlanProgressConfig, "totalWeeks">
): PositionedWorkout[] {
  const observedTrainingCount = workouts.reduce((count, workout) => (
    workout.day_type === "training" && typeof workout.sequence_index === "number"
      ? Math.max(count, workout.sequence_index + 1)
      : count
  ), 0);
  const cumulativeTrainingCounts = Array.from({ length: config.totalWeeks }, (_, index) => (
    config.scheduleRule
      ? getTargetTrainingCount({ startDate, trainingWeeks: index + 1, rule: config.scheduleRule })
      : config.trainingDaysPerWeek
        ? (index + 1) * config.trainingDaysPerWeek
        : Math.ceil(observedTrainingCount * (index + 1) / config.totalWeeks)
  ));
  const configuredTrainingCount = cumulativeTrainingCounts.at(-1) ?? 0;

  return positionWithResolver(workouts, (sequenceIndex) => ({
    deferred: sequenceIndex >= configuredTrainingCount,
    week: cumulativeTrainingCounts.findIndex((count) => sequenceIndex < count) + 1 || config.totalWeeks
  }));
}

function positionWithResolver(
  workouts: PlanOutlineWorkout[],
  resolve: (sequenceIndex: number) => { deferred: boolean; week: number }
): PositionedWorkout[] {
  const nextTrainingByIndex = new Map<number, PlanOutlineWorkout>();
  let nextTraining: PlanOutlineWorkout | null = null;
  for (let index = workouts.length - 1; index >= 0; index -= 1) {
    if (workouts[index].day_type === "training") nextTraining = workouts[index];
    if (nextTraining) nextTrainingByIndex.set(index, nextTraining);
  }

  let lastTraining: PlanOutlineWorkout | null = null;
  return workouts.map((workout, index) => {
    if (workout.day_type === "training") lastTraining = workout;
    const anchor = workout.day_type === "training" ? workout : lastTraining ?? nextTrainingByIndex.get(index) ?? null;
    const sequenceIndex = anchor?.sequence_index ?? 0;
    const cycleIndex = typeof anchor?.cycle_index === "number" ? anchor.cycle_index + 1 : null;
    const position = resolve(sequenceIndex);
    return {
      workout,
      week: position.week,
      cycleIndex,
      deferred: position.deferred
    };
  });
}

function normalizeProgressConfig(config: PlanProgressConfig) {
  return {
    ...config,
    totalWeeks: Math.max(1, Math.floor(config.totalWeeks))
  };
}

function groupMetadataCycles(items: PositionedWorkout[]) {
  if (!items.some((item) => item.cycleIndex !== null)) {
    return groupLegacyCycles(items.map((item) => item.workout));
  }

  const groups = new Map<number, PlanOutlineWorkout[]>();
  for (const item of items) {
    const index = item.cycleIndex ?? groups.keys().next().value ?? 1;
    groups.set(index, [...(groups.get(index) ?? []), item.workout]);
  }
  return [...groups.entries()].map(([index, workouts]) => buildCycle(index, workouts));
}

function groupLegacyCalendarOutline(workouts: PlanOutlineWorkout[], startDate: string) {
  const start = parseDate(startDate);
  const weeks = new Map<number, PlanOutlineWorkout[]>();
  workouts.forEach((workout) => {
    const week = Math.max(1, Math.floor((parseDate(workout.scheduled_date).getTime() - start.getTime()) / 86400000 / 7) + 1);
    weeks.set(week, [...(weeks.get(week) ?? []), workout]);
  });
  return [...weeks].map(([week, items]) => ({
    week,
    calendarWeekLabel: `第 ${week} 周`,
    startDate: items[0]?.scheduled_date ?? startDate,
    endDate: items.at(-1)?.scheduled_date ?? startDate,
    ...getTrainingDaySummary(items),
    deferredTrainingDays: 0,
    cycles: groupLegacyCycles(items)
  }));
}

function groupLegacyCycles(workouts: PlanOutlineWorkout[]) {
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
  return cycles.map((items, index) => buildCycle(index + 1, items));
}

function buildCycle(index: number, workouts: PlanOutlineWorkout[]) {
  return {
    index,
    label: workouts
      .filter((item) => item.day_type === "training")
      .map((item) => item.name)
      .join(" → ") || "恢复安排",
    startDate: workouts[0]?.scheduled_date ?? "",
    endDate: workouts.at(-1)?.scheduled_date ?? "",
    ...getTrainingDaySummary(workouts),
    workouts
  };
}

function getCalendarWeekLabel(workouts: PlanOutlineWorkout[], startDate: string) {
  if (workouts.length === 0) return "尚未安排";
  const start = parseDate(startDate).getTime();
  const calendarWeeks = workouts.map((workout) => (
    Math.max(1, Math.floor((parseDate(workout.scheduled_date).getTime() - start) / 86400000 / 7) + 1)
  ));
  const first = Math.min(...calendarWeeks);
  const last = Math.max(...calendarWeeks);
  return first === last ? `第 ${first} 周` : `第 ${first}–${last} 周`;
}

function getTrainingDaySummary(workouts: PlanOutlineWorkout[]) {
  const trainingDays = workouts.filter((workout) => workout.day_type === "training");
  return {
    completedTrainingDays: trainingDays.filter((workout) => workout.status === "completed").length,
    totalTrainingDays: trainingDays.length
  };
}

function parseDate(date: string) {
  return new Date(`${date}T00:00:00`);
}
