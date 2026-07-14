import { describe, expect, it } from "vitest";

import { getNextWorkoutState } from "./next-workout";

describe("getNextWorkoutState", () => {
  it("marks an overdue suggestion as a continuation instead of dropping the session", () => {
    expect(getNextWorkoutState("2026-07-12", new Date("2026-07-15T10:00:00"))).toEqual({
      kind: "overdue",
      overdueDays: 3
    });
  });
});
