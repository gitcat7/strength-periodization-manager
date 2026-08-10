import { describe, expect, it } from "vitest";

import { filterHistoryWorkoutsByDate } from "./history-date-filter";

describe("filterHistoryWorkoutsByDate", () => {
  const workouts = [
    { id: "first", scheduled_date: "2026-07-01" },
    { id: "second", scheduled_date: "2026-07-01" },
    { id: "third", scheduled_date: "2026-07-02" }
  ];

  it("keeps every completed workout recorded on the selected date", () => {
    expect(filterHistoryWorkoutsByDate(workouts, "2026-07-01").map((workout) => workout.id)).toEqual(["first", "second"]);
  });

  it("keeps all history when no date is selected", () => {
    expect(filterHistoryWorkoutsByDate(workouts, "")).toEqual(workouts);
  });
});
