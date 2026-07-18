import { describe, expect, it } from "vitest";
import { buildHistoryCalendarDays } from "./history-calendar";

describe("buildHistoryCalendarDays", () => {
  it("builds a Monday-first July grid and aggregates two completed workouts on one date", () => {
    const days = buildHistoryCalendarDays(new Date(2026, 6, 1), [
      { id: "workout-1", scheduledDate: "2026-07-15", status: "completed", dayType: "training", completedVolume: 845 },
      { id: "workout-2", scheduledDate: "2026-07-15", status: "completed", dayType: "training", completedVolume: 500 }
    ]);

    expect(days).toHaveLength(42);
    expect(days[0]).toMatchObject({ date: "2026-06-29", inMonth: false });
    expect(days.find((day) => day.date === "2026-07-15")).toMatchObject({
      completedVolume: 1345,
      status: "completed"
    });
  });

  it("keeps recovery and planned days distinct without inventing training volume", () => {
    const days = buildHistoryCalendarDays(new Date(2026, 6, 1), [
      { id: "rest", scheduledDate: "2026-07-16", status: "completed", dayType: "rest", completedVolume: 999 },
      { id: "planned", scheduledDate: "2026-07-17", status: "scheduled", dayType: "training", completedVolume: 300 }
    ]);

    expect(days.find((day) => day.date === "2026-07-16")).toMatchObject({ completedVolume: 0, status: "rest" });
    expect(days.find((day) => day.date === "2026-07-17")).toMatchObject({ completedVolume: 0, status: "planned" });
  });
});
