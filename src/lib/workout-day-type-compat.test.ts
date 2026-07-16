import { describe, expect, it, vi } from "vitest";

import { loadWorkoutsWithDayTypeFallback } from "./workout-day-type-compat";

describe("loadWorkoutsWithDayTypeFallback", () => {
  it("retries the legacy query once when the deployed database lacks day_type", async () => {
    const primary = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42703", message: "column workouts.day_type does not exist" }
    });
    const legacy = vi.fn().mockResolvedValue({
      data: [{ id: "workout-1", name: "推 A", sequence_index: 3 }],
      error: null
    });

    const result = await loadWorkoutsWithDayTypeFallback(primary, legacy);

    expect(legacy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      data: [{ day_type: "training", id: "workout-1", name: "推 A", schedule_index: 3, sequence_index: 3 }],
      error: null,
      usedLegacySchema: true
    });
  });

  it("does not hide unrelated database errors", async () => {
    const legacy = vi.fn();
    const error = { code: "42501", message: "permission denied" };

    const result = await loadWorkoutsWithDayTypeFallback(
      () => Promise.resolve({ data: null, error }),
      legacy
    );

    expect(legacy).not.toHaveBeenCalled();
    expect(result).toEqual({ data: null, error, usedLegacySchema: false });
  });
});
