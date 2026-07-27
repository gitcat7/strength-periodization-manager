import { expect, it } from "vitest";
import { groupPlanOutline } from "./plan-outline";

it("groups workouts into plan weeks from the program start date", () => {
  expect(groupPlanOutline([
    { id: "a", day_type: "training", name: "推 A", schedule_index: 0, scheduled_date: "2026-07-27", status: "completed" },
    { id: "b", day_type: "training", name: "拉 B", schedule_index: 1, scheduled_date: "2026-08-02", status: "scheduled" },
    { id: "c", day_type: "rest", name: "恢复日", schedule_index: 2, scheduled_date: "2026-08-03", status: "scheduled" }
  ], "2026-07-27")).toMatchObject([{ week: 1, cycles: [{ workouts: [{ id: "a" }, { id: "b" }] }] }, { week: 2, cycles: [{ workouts: [{ id: "c" }] }] }]);
});
