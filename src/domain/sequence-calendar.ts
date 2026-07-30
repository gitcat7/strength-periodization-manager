import type { ScheduleRule } from "@/domain/schedule-rule";

export type CalendarConstraint = {
  date: string;
  kind: "holiday" | "personal_unavailable" | "override";
  allowsTraining: boolean;
  label: string;
};

export type CalendarScheduleItem = {
  scheduledDate: string;
  scheduleIndex: number;
  sequenceIndex: number | null;
  dayType: "training" | "rest";
  blockedReasons: string[];
};

// Safety cap (~10 years) so invalid rules or permanent blocks fail loudly instead of looping.
const MAX_CALENDAR_DAYS = 3660;

const kindPriority: Record<CalendarConstraint["kind"], number> = {
  personal_unavailable: 0,
  override: 1,
  holiday: 2
};

export function getTargetTrainingCount(input: {
  startDate: string;
  trainingWeeks: number;
  rule: ScheduleRule;
}): number {
  const { rule } = input;
  const start = parseLocalDate(input.startDate);
  const totalDays = Math.max(0, Math.floor(input.trainingWeeks)) * 7;

  let count = 0;
  for (let offset = 0; offset < totalDays; offset += 1) {
    const cursor = new Date(start);
    cursor.setDate(cursor.getDate() + offset);
    if (isTrainingDate(rule, cursor, offset)) count += 1;
  }
  return count;
}

export function buildSequenceCalendar(input: {
  startDate: string;
  targetTrainingCount: number;
  rule: ScheduleRule;
  constraints: CalendarConstraint[];
}): CalendarScheduleItem[] {
  const { rule } = input;
  const constraintsByDate = new Map<string, CalendarConstraint[]>();
  for (const constraint of input.constraints) {
    const existing = constraintsByDate.get(constraint.date) ?? [];
    existing.push(constraint);
    constraintsByDate.set(constraint.date, existing);
  }

  const items: CalendarScheduleItem[] = [];
  const cursor = parseLocalDate(input.startDate);
  let trainingsScheduled = 0;
  let phaseIndex = 0;

  while (trainingsScheduled < input.targetTrainingCount) {
    if (items.length >= MAX_CALENDAR_DAYS) {
      throw new Error("无法在合理范围内完成排程，请检查排程规则。");
    }

    const scheduledDate = formatLocalDate(cursor);
    const blockedReasons = getBlockedReasons(scheduledDate, constraintsByDate);
    const isTraining = blockedReasons.length === 0 && isTrainingDate(rule, cursor, phaseIndex);

    items.push({
      scheduledDate,
      scheduleIndex: items.length,
      sequenceIndex: isTraining ? trainingsScheduled : null,
      dayType: isTraining ? "training" : "rest",
      blockedReasons
    });

    if (isTraining) trainingsScheduled += 1;
    // Blocked dates insert one rest item without consuming a train/rest phase.
    if (blockedReasons.length === 0) phaseIndex += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return items;
}

function isTrainingDate(rule: ScheduleRule, date: Date, phaseIndex: number): boolean {
  if (rule.mode === "cadence") {
    const cycleLength = rule.trainDays + rule.restDays;
    return phaseIndex % cycleLength < rule.trainDays;
  }
  return rule.weekdays.includes(date.getDay());
}

function getBlockedReasons(
  date: string,
  constraintsByDate: Map<string, CalendarConstraint[]>
): string[] {
  const dayConstraints = constraintsByDate.get(date);
  if (!dayConstraints || dayConstraints.length === 0) return [];

  const sorted = [...dayConstraints].sort((a, b) => kindPriority[a.kind] - kindPriority[b.kind]);
  // The highest-priority constraint decides; an allowing override cancels a holiday block.
  if (sorted[0]?.allowsTraining) return [];
  return sorted.filter((constraint) => !constraint.allowsTraining).map((constraint) => constraint.label);
}

function parseLocalDate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
