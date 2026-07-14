import { describe, expect, it } from "vitest";

import { buildFourWeekProgram } from "./program";

const profiles = [
  { id: "bench", slug: "bench_press", workingWeight: 100, increment: 2.5 },
  { id: "row", slug: "barbell_row", workingWeight: 80, increment: 2.5 },
  { id: "squat", slug: "back_squat", workingWeight: 120, increment: 5 }
];

describe("buildFourWeekProgram", () => {
  it("assigns a stable zero-based sequence index without changing fixed-weekday dates", () => {
    const workouts = buildFourWeekProgram({
      templateType: "three_day_full_body",
      availableWeekdays: [1, 3, 5],
      exerciseProfiles: profiles,
      startDate: new Date("2026-07-13T00:00:00")
    });

    expect(workouts.map((workout) => workout.sequenceIndex)).toEqual(
      Array.from({ length: 12 }, (_, index) => index)
    );
    expect(workouts.slice(0, 3).map((workout) => workout.scheduledDate)).toEqual([
      "2026-07-13",
      "2026-07-15",
      "2026-07-17"
    ]);
  });
});
