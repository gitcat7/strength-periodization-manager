import { describe, expect, it } from "vitest";
import { getHistoryWorkoutFocusId } from "./history-workout-focus";

describe("getHistoryWorkoutFocusId", () => {
  const visibleWorkouts = [{ id: "owned-workout" }, { id: "another-owned-workout" }];

  it("focuses a requested workout only when it belongs to the already visible history list", () => {
    expect(getHistoryWorkoutFocusId("?workout=owned-workout", visibleWorkouts)).toBe("owned-workout");
  });

  it("ignores missing, invalid, and non-owned workout IDs without querying for them", () => {
    expect(getHistoryWorkoutFocusId("", visibleWorkouts)).toBeNull();
    expect(getHistoryWorkoutFocusId("?workout=not-visible", visibleWorkouts)).toBeNull();
    expect(getHistoryWorkoutFocusId("?workout=", visibleWorkouts)).toBeNull();
  });
});
