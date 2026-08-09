import { describe, expect, it } from "vitest";

import { getNextWorkoutActionLabel, getNextWorkoutState } from "./next-workout";

describe("getNextWorkoutState", () => {
  it("marks an overdue suggestion as a continuation instead of dropping the session", () => {
    expect(getNextWorkoutState("2026-07-12", new Date("2026-07-15T10:00:00"))).toEqual({
      kind: "overdue",
      overdueDays: 3
    });
  });

  it("does not call an overdue or future session today's plan", () => {
    expect(getNextWorkoutActionLabel({ kind: "overdue", overdueDays: 3 })).toBe("继续未完成训练");
    expect(getNextWorkoutActionLabel({ kind: "upcoming", daysUntil: 2 })).toBe("查看下一节训练");
  });
});
