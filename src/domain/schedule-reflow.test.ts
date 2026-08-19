import { describe, expect, it } from "vitest";

import { buildReflowScheduleItems } from "./schedule-reflow";

describe("buildReflowScheduleItems", () => {
  it("keeps scheduled dates non-decreasing when read by schedule index", () => {
    const result = buildReflowScheduleItems({
      blockedDates: new Map(),
      fromDate: "2026-08-20",
      programStartDate: "2026-08-20",
      rule: { mode: "cadence", trainDays: 2, restDays: 1 },
      rows: [
        { id: "training-a", day_type: "training", schedule_index: 0, sequence_index: 0, scheduled_date: "2026-08-20" },
        { id: "recovery", day_type: "rest", schedule_index: 1, sequence_index: null, scheduled_date: "2026-08-21" },
        { id: "training-b", day_type: "training", schedule_index: 2, sequence_index: 1, scheduled_date: "2026-08-22" }
      ]
    });

    expect(result.map((item) => [item.scheduleIndex, item.scheduledDate, item.workoutId])).toEqual([
      [0, "2026-08-20", "training-a"],
      [1, "2026-08-21", "training-b"],
      [2, "2026-08-22", "recovery"]
    ]);
  });
});
