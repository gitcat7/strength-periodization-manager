import { describe, expect, it } from "vitest";
import { parseWorkingSet } from "./pr-goal-manager";

describe("PR missing-lift working set", () => {
  it("accepts one valid kg and reps pair without requiring plan parameters", () => {
    expect(parseWorkingSet("80", "5")).toEqual({ weightKg: 80, reps: 5 });
  });

  it("rejects missing or unsafe working-set values", () => {
    expect(parseWorkingSet("", "5")).toBeNull();
    expect(parseWorkingSet("80", "31")).toBeNull();
  });
});
