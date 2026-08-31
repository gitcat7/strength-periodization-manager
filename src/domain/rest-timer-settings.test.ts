import { describe, expect, it } from "vitest";

import { parseRestTimerSeconds } from "./rest-timer-settings";

describe("custom rest timer seconds", () => {
  it("accepts whole seconds from 30 through 900", () => {
    expect(parseRestTimerSeconds("45")).toEqual({ seconds: 45, error: null });
    expect(parseRestTimerSeconds("900")).toEqual({ seconds: 900, error: null });
  });

  it("rejects empty, non-integer and out-of-range values", () => {
    expect(parseRestTimerSeconds("").error).toContain("请输入");
    expect(parseRestTimerSeconds("60.5").error).toContain("整数");
    expect(parseRestTimerSeconds("29").error).toContain("30–900");
    expect(parseRestTimerSeconds("901").error).toContain("30–900");
  });
});
