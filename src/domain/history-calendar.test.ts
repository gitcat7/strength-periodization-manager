import { describe, expect, it } from "vitest";

import { buildHistoryCalendarDays, shiftCalendarMonth } from "./history-calendar";

describe("history calendar", () => {
  it("builds Monday-first calendar days and gives completed training priority", () => {
    const days = buildHistoryCalendarDays({
      month: "2026-07",
      selectedDate: "2026-07-27",
      workouts: [
        { day_type: "training", id: "done", name: "推 A", scheduled_date: "2026-07-27", status: "completed", volume: 845 },
        { day_type: "training", id: "next", name: "拉 B", scheduled_date: "2026-07-28", status: "scheduled", volume: 0 },
        { day_type: "rest", id: "rest", name: "恢复日", scheduled_date: "2026-07-29", status: "scheduled", volume: 0 }
      ]
    });

    expect(days).toHaveLength(42);
    expect(days[0]).toMatchObject({ date: "2026-06-29", inCurrentMonth: false });
    expect(days.find((day) => day.date === "2026-07-27")).toMatchObject({
      selected: true,
      state: "completed",
      volume: 845
    });
    expect(days.find((day) => day.date === "2026-07-28")).toMatchObject({ state: "scheduled" });
    expect(days.find((day) => day.date === "2026-07-29")).toMatchObject({ state: "rest" });
  });

  it("moves calendar months across a year boundary", () => {
    expect(shiftCalendarMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftCalendarMonth("2026-12", 1)).toBe("2027-01");
  });
});
