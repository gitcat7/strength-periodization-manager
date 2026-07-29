import { describe, expect, it } from "vitest";

import {
  formatWorkoutDuration,
  getAutomaticDurationMinutes,
  getElapsedDurationSeconds,
  validateManualDurationMinutes
} from "./workout-duration";

describe("workout duration", () => {
  it("calculates elapsed seconds from the persisted start time", () => {
    expect(getElapsedDurationSeconds("2026-07-29T10:00:00.000Z", Date.parse("2026-07-29T11:02:03.000Z"))).toBe(3723);
    expect(getElapsedDurationSeconds(null)).toBeNull();
    expect(getAutomaticDurationMinutes("2026-07-29T10:00:00.000Z", Date.parse("2026-07-29T11:02:03.000Z"))).toBe(62);
  });

  it("formats stored duration for history", () => {
    expect(formatWorkoutDuration(3723)).toBe("1 小时 2 分钟");
    expect(formatWorkoutDuration(null)).toBe("未记录");
  });

  it("only accepts manual whole minutes in the safe range", () => {
    expect(validateManualDurationMinutes("1")).toEqual({ ok: true, seconds: 60 });
    expect(validateManualDurationMinutes("720")).toEqual({ ok: true, seconds: 43200 });
    expect(validateManualDurationMinutes("0")).toEqual({ ok: false, message: "训练时长请输入 1–720 的整数分钟。" });
    expect(validateManualDurationMinutes("12.5")).toEqual({ ok: false, message: "训练时长请输入 1–720 的整数分钟。" });
  });
});
