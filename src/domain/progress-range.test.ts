import { describe, expect, it } from "vitest";

import {
  formatPeriodChange,
  isDateInProgressRange,
  progressRangeOptions
} from "./progress-range";

describe("progress range", () => {
  it("offers only 4, 8, and 12 weeks", () => {
    expect(progressRangeOptions).toEqual([4, 8, 12]);
  });

  it("includes the reference day and the first day of the selected window", () => {
    const reference = new Date("2026-07-30T12:00:00+08:00");
    expect(isDateInProgressRange("2026-07-30", 4, reference)).toBe(true);
    expect(isDateInProgressRange("2026-07-03", 4, reference)).toBe(true);
    expect(isDateInProgressRange("2026-07-02", 4, reference)).toBe(false);
  });

  it("formats increase, decrease, unchanged, and unavailable comparisons", () => {
    expect(formatPeriodChange(1200, 1000)).toBe("较上周 +20.0%");
    expect(formatPeriodChange(800, 1000)).toBe("较上周 -20.0%");
    expect(formatPeriodChange(1000, 1000)).toBe("较上周 0.0%");
    expect(formatPeriodChange(1000, 0)).toBe("暂无上周基线");
  });
});
