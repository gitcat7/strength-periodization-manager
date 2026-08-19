import { expect, it } from "vitest";
import { getDefaultPlanPosition, groupPlanOutline } from "./plan-outline";

it("groups workouts into plan weeks from the program start date", () => {
  expect(groupPlanOutline([
    { id: "a", day_type: "training", name: "推 A", schedule_index: 0, sequence_index: 0, scheduled_date: "2026-07-27", status: "completed" },
    { id: "b", day_type: "training", name: "拉 B", schedule_index: 1, sequence_index: 1, scheduled_date: "2026-08-02", status: "scheduled" },
    { id: "c", day_type: "rest", name: "恢复日", schedule_index: 2, sequence_index: null, scheduled_date: "2026-08-03", status: "scheduled" }
  ], "2026-07-27")).toMatchObject([{ week: 1, cycles: [{ workouts: [{ id: "a" }, { id: "b" }] }] }, { week: 2, cycles: [{ workouts: [{ id: "c" }] }] }]);
});

it("summarizes a week and labels each training structure cycle", () => {
  expect(groupPlanOutline([
    { id: "a", day_type: "training", name: "推 A", schedule_index: 0, sequence_index: 0, scheduled_date: "2026-07-27", status: "completed" },
    { id: "b", day_type: "rest", name: "恢复日", schedule_index: 1, sequence_index: null, scheduled_date: "2026-07-28", status: "scheduled" },
    { id: "c", day_type: "training", name: "拉 B", schedule_index: 2, sequence_index: 1, scheduled_date: "2026-07-29", status: "scheduled" },
    { id: "d", day_type: "training", name: "推 A", schedule_index: 3, sequence_index: 2, scheduled_date: "2026-07-30", status: "scheduled" }
  ], "2026-07-27")).toMatchObject([
    {
      week: 1,
      startDate: "2026-07-27",
      endDate: "2026-07-30",
      completedTrainingDays: 1,
      totalTrainingDays: 3,
      cycles: [
        { label: "推 A → 拉 B", startDate: "2026-07-27", endDate: "2026-07-29", completedTrainingDays: 1, totalTrainingDays: 2 },
        { label: "推 A", startDate: "2026-07-30", endDate: "2026-07-30", completedTrainingDays: 0, totalTrainingDays: 1 }
      ]
    }
  ]);
});

it("opens the current week and its first unfinished training cycle", () => {
  const outline = groupPlanOutline([
    { id: "a", day_type: "training", name: "推 A", schedule_index: 0, sequence_index: 0, scheduled_date: "2026-07-27", status: "completed" },
    { id: "b", day_type: "training", name: "拉 B", schedule_index: 1, sequence_index: 1, scheduled_date: "2026-07-28", status: "completed" },
    { id: "c", day_type: "training", name: "推 A", schedule_index: 2, sequence_index: 2, scheduled_date: "2026-07-29", status: "scheduled" }
  ], "2026-07-27");

  expect(getDefaultPlanPosition(outline, "2026-07-27", new Date("2026-07-28T08:00:00")))
    .toEqual({ week: 1, cycleIndex: 2 });
});

it("falls back to the first week and cycle with unfinished training", () => {
  const outline = groupPlanOutline([
    { id: "a", day_type: "training", name: "推 A", schedule_index: 0, sequence_index: 0, scheduled_date: "2026-07-01", status: "completed" },
    { id: "b", day_type: "training", name: "拉 B", schedule_index: 8, sequence_index: 1, scheduled_date: "2026-07-09", status: "scheduled" }
  ], "2026-07-01");

  expect(getDefaultPlanPosition(outline, "2026-07-01", new Date("2026-08-20T08:00:00")))
    .toEqual({ week: 2, cycleIndex: 1 });
});

it("uses the final cycle when all training days are complete", () => {
  const outline = groupPlanOutline([
    { id: "a", day_type: "training", name: "推 A", schedule_index: 0, sequence_index: 0, scheduled_date: "2026-07-01", status: "completed" },
    { id: "b", day_type: "training", name: "拉 B", schedule_index: 1, sequence_index: 1, scheduled_date: "2026-07-02", status: "completed" }
  ], "2026-07-01");

  expect(getDefaultPlanPosition(outline, "2026-07-01", new Date("2026-08-20T08:00:00")))
    .toEqual({ week: 1, cycleIndex: 1 });
});

it("uses sequence and cycle metadata for plan progress instead of workout names or delayed calendar weeks", () => {
  const outline = groupPlanOutline([
    { id: "a", day_type: "training", name: "第 1 周 · 推 A", schedule_index: 0, sequence_index: 0, cycle_index: 0, cycle_position: 0, scheduled_date: "2026-07-01", status: "completed" },
    { id: "b", day_type: "rest", name: "恢复日", schedule_index: 1, sequence_index: null, cycle_index: null, cycle_position: null, scheduled_date: "2026-07-20", status: "scheduled" },
    { id: "c", day_type: "training", name: "名称不可信", schedule_index: 2, sequence_index: 1, cycle_index: 0, cycle_position: 1, scheduled_date: "2026-07-21", status: "scheduled" },
    { id: "d", day_type: "training", name: "仍然不是周标签", schedule_index: 3, sequence_index: 2, cycle_index: 1, cycle_position: 0, scheduled_date: "2026-07-22", status: "scheduled" }
  ], "2026-07-01", 2);

  expect(outline).toMatchObject([
    {
      week: 1,
      calendarWeekLabel: "第 1–3 周",
      cycles: [{ index: 1, workouts: [{ id: "a" }, { id: "b" }, { id: "c" }] }]
    },
    {
      week: 2,
      calendarWeekLabel: "第 4 周",
      cycles: [{ index: 2, workouts: [{ id: "d" }] }]
    }
  ]);
});

it("selects the first unfinished plan-progress week even when the calendar has slipped", () => {
  const outline = groupPlanOutline([
    { id: "a", day_type: "training", name: "任意名称", schedule_index: 0, sequence_index: 0, cycle_index: 0, cycle_position: 0, scheduled_date: "2026-07-01", status: "completed" },
    { id: "b", day_type: "training", name: "任意名称", schedule_index: 1, sequence_index: 1, cycle_index: 0, cycle_position: 1, scheduled_date: "2026-08-20", status: "scheduled" }
  ], "2026-07-01", 2);

  expect(getDefaultPlanPosition(outline, "2026-07-01", new Date("2026-08-20T08:00:00")))
    .toEqual({ week: 1, cycleIndex: 1 });
});

it("keeps a 63-session cadence plan inside its configured 12 progress weeks after a pause delay", () => {
  const workouts = Array.from({ length: 63 }, (_, sequenceIndex) => ({
    id: `training-${sequenceIndex}`,
    day_type: "training" as const,
    name: `不解析名称 ${sequenceIndex}`,
    schedule_index: sequenceIndex,
    sequence_index: sequenceIndex,
    cycle_index: Math.floor(sequenceIndex / 5),
    cycle_position: sequenceIndex % 5,
    scheduled_date: shiftDate("2026-07-01", sequenceIndex + (sequenceIndex >= 3 ? 42 : 0)),
    status: sequenceIndex < 60 ? "completed" : "scheduled"
  }));

  const outline = groupPlanOutline(workouts, "2026-07-01", {
    scheduleRule: { mode: "cadence", trainDays: 3, restDays: 1 },
    totalWeeks: 12
  });

  expect(outline.map((week) => week.week)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  expect(Math.max(...outline.map((week) => week.week))).toBe(12);
  expect(outline.flatMap((week) => week.cycles.flatMap((cycle) => cycle.workouts))).toHaveLength(63);
  expect(outline.at(-1)).toMatchObject({ calendarWeekLabel: "第 15 周", deferredTrainingDays: 0 });
  expect(getDefaultPlanPosition(outline, "2026-07-01", new Date("2026-10-10T08:00:00")))
    .toEqual({ week: 12, cycleIndex: 13 });
});

it("keeps legacy overflow visible in the final configured week and labels it as deferred", () => {
  const workouts = Array.from({ length: 63 }, (_, sequenceIndex) => ({
    id: `legacy-${sequenceIndex}`,
    day_type: "training" as const,
    name: "五分化训练",
    schedule_index: sequenceIndex,
    sequence_index: sequenceIndex,
    cycle_index: Math.floor(sequenceIndex / 5),
    cycle_position: sequenceIndex % 5,
    scheduled_date: shiftDate("2026-07-01", sequenceIndex),
    status: "scheduled"
  }));

  const outline = groupPlanOutline(workouts, "2026-07-01", {
    scheduleRule: { mode: "fixed_weekdays", weekdays: [1, 2, 3, 4, 5] },
    totalWeeks: 12
  });

  expect(outline).toHaveLength(12);
  expect(outline.at(-1)?.deferredTrainingDays).toBe(3);
  expect(outline.flatMap((week) => week.cycles.flatMap((cycle) => cycle.workouts))).toHaveLength(63);
});

it("uses the same configured-week rule for other templates without changing empty plans", () => {
  const twoDayPlan = Array.from({ length: 8 }, (_, sequenceIndex) => ({
    id: `full-body-${sequenceIndex}`,
    day_type: "training" as const,
    name: "全身训练",
    schedule_index: sequenceIndex,
    sequence_index: sequenceIndex,
    cycle_index: sequenceIndex,
    cycle_position: 0,
    scheduled_date: shiftDate("2026-07-01", sequenceIndex * 3),
    status: "scheduled"
  }));

  expect(groupPlanOutline(twoDayPlan, "2026-07-01", {
    totalWeeks: 4
  }).map((week) => week.week)).toEqual([1, 2, 3, 4]);
  expect(groupPlanOutline([], "2026-07-01", {
    scheduleRule: { mode: "fixed_weekdays", weekdays: [1, 4] },
    totalWeeks: 4
  })).toEqual([]);
});

function shiftDate(startDate: string, days: number) {
  const date = new Date(`${startDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
