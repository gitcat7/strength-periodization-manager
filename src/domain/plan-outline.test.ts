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
