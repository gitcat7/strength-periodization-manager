import { describe, expect, it } from "vitest";

import { buildHistoryCalendarDays, selectHistoryDetailWorkouts } from "./history-calendar";

describe("history calendar detail selection", () => {
  it("returns only completed workouts on the explicitly selected date", () => {
    const workouts = [
      { id: "july-18", scheduled_date: "2026-07-18", status: "completed" },
      { id: "july-31", scheduled_date: "2026-07-31", status: "completed" },
      { id: "planned-31", scheduled_date: "2026-07-31", status: "scheduled" }
    ];
    const calendarDays = buildHistoryCalendarDays(new Date(2026, 6, 1), [
      { id: "july-18", scheduledDate: "2026-07-18", status: "completed", dayType: "training", completedVolume: 845 },
      { id: "july-31", scheduledDate: "2026-07-31", status: "completed", dayType: "training", completedVolume: 0 },
      { id: "planned-31", scheduledDate: "2026-07-31", status: "scheduled", dayType: "training", completedVolume: 0 }
    ]);

    expect(selectHistoryDetailWorkouts("2026-07-31", calendarDays, workouts)).toEqual([
      { id: "july-31", scheduled_date: "2026-07-31", status: "completed" }
    ]);
    expect(selectHistoryDetailWorkouts(null, calendarDays, workouts)).toEqual([]);
  });
});
