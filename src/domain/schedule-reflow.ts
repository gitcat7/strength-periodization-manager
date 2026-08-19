import type { ReflowScheduleItem } from "@/domain/schedule-reflow-payload";
import type { ScheduleRule } from "@/domain/schedule-rule";

export type ReflowSourceWorkout = {
  day_type: "training" | "rest";
  id: string;
  schedule_index: number;
  scheduled_date: string;
  sequence_index: number | null;
};

// Re-dates pending rows day by day, preserving the existing set of schedule-index
// slots while assigning those slots in date order. The RPC therefore updates rows
// atomically without inserting/deleting rows or leaving index/date order divergent.
export function buildReflowScheduleItems(input: {
  rows: ReflowSourceWorkout[];
  rule: ScheduleRule | null;
  programStartDate: string;
  blockedDates: ReadonlyMap<string, string>;
  fromDate: string;
}): ReflowScheduleItem[] {
  const { rows, rule, blockedDates, fromDate } = input;
  if (rows.length === 0) return [];

  if (!rule) {
    // Legacy schedules without a stored rule keep their relative spacing.
    const delta = Math.max(0, daysBetweenDates(rows[0].scheduled_date, fromDate));
    return assignScheduleIndexesByDate(
      rows.map((row) => toReflowItem(row, shiftDate(row.scheduled_date, delta))),
      rows
    );
  }

  const trainingQueue = rows.filter((row) => row.day_type === "training");
  const restQueue = rows.filter((row) => row.day_type === "rest");
  const assignments: ReflowScheduleItem[] = [];

  let phase = getCadencePhaseOffset(rule, input.programStartDate, fromDate, blockedDates);
  const cursor = parseLocalDate(fromDate);
  let guard = 0;

  while ((trainingQueue.length > 0 || restQueue.length > 0) && guard < 3660) {
    guard += 1;
    const dateStr = formatLocalDate(cursor);

    if (blockedDates.has(dateStr)) {
      const restRow = restQueue.shift();
      // Blocked days host a rest row when one remains and never consume a phase.
      if (restRow) assignments.push(toReflowItem(restRow, dateStr));
    } else {
      const isTrainingDay = isRuleTrainingDay(rule, cursor, phase);
      const row = isTrainingDay
        ? trainingQueue.shift() ?? restQueue.shift()
        : restQueue.shift() ?? trainingQueue.shift();
      if (row) assignments.push(toReflowItem(row, dateStr));
      phase += 1;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  for (const leftover of [...trainingQueue, ...restQueue]) {
    assignments.push(toReflowItem(leftover, leftover.scheduled_date));
  }

  return assignScheduleIndexesByDate(assignments, rows);
}

function assignScheduleIndexesByDate(
  assignments: ReflowScheduleItem[],
  sourceRows: ReflowSourceWorkout[]
): ReflowScheduleItem[] {
  const availableIndexes = sourceRows.map((row) => row.schedule_index).sort((a, b) => a - b);
  return [...assignments]
    .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate) || left.scheduleIndex - right.scheduleIndex)
    .map((item, index) => ({ ...item, scheduleIndex: availableIndexes[index] }))
    .sort((left, right) => left.scheduleIndex - right.scheduleIndex);
}

function getCadencePhaseOffset(
  rule: ScheduleRule,
  startDate: string,
  targetDate: string,
  blockedDates: ReadonlyMap<string, string>
): number {
  if (rule.mode !== "cadence") return 0;

  let count = 0;
  const cursor = parseLocalDate(startDate);
  const target = parseLocalDate(targetDate);
  let guard = 0;
  while (cursor.getTime() < target.getTime() && guard < 3660) {
    guard += 1;
    if (!blockedDates.has(formatLocalDate(cursor))) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function isRuleTrainingDay(rule: ScheduleRule, date: Date, phase: number): boolean {
  if (rule.mode === "cadence") {
    const cycleLength = rule.trainDays + rule.restDays;
    return phase % cycleLength < rule.trainDays;
  }
  return rule.weekdays.includes(date.getDay());
}

function toReflowItem(row: ReflowSourceWorkout, scheduledDate: string): ReflowScheduleItem {
  return {
    workoutId: row.id,
    scheduledDate,
    scheduleIndex: row.schedule_index,
    sequenceIndex: row.sequence_index,
    dayType: row.day_type,
    status: "scheduled"
  };
}

function daysBetweenDates(fromDate: string, toDate: string) {
  const from = parseLocalDate(fromDate).getTime();
  const to = parseLocalDate(toDate).getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function shiftDate(date: string, days: number) {
  const shifted = parseLocalDate(date);
  shifted.setDate(shifted.getDate() + days);
  return formatLocalDate(shifted);
}

function parseLocalDate(date: string) {
  return new Date(`${date}T00:00:00`);
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
