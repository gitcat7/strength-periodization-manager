import { describe, expect, it } from "vitest";

import {
  cadencePresets,
  getScheduleDensity,
  getScheduleRuleLabel,
  validateScheduleRule,
  weekdayPresets
} from "./schedule-rule";

describe("validateScheduleRule", () => {
  it("accepts a valid cadence rule", () => {
    expect(validateScheduleRule({ mode: "cadence", trainDays: 3, restDays: 1 })).toEqual({});
  });

  it("rejects cadence train days outside 1-6", () => {
    expect(validateScheduleRule({ mode: "cadence", trainDays: 7, restDays: 1 })).toEqual({
      trainDays: "连续训练天数应为 1–6 天"
    });
    expect(validateScheduleRule({ mode: "cadence", trainDays: 0, restDays: 1 })).toEqual({
      trainDays: "连续训练天数应为 1–6 天"
    });
  });

  it("rejects cadence rest days outside 1-3", () => {
    expect(validateScheduleRule({ mode: "cadence", trainDays: 3, restDays: 0 })).toEqual({
      restDays: "连续休息天数应为 1–3 天"
    });
    expect(validateScheduleRule({ mode: "cadence", trainDays: 3, restDays: 4 })).toEqual({
      restDays: "连续休息天数应为 1–3 天"
    });
  });

  it("rejects empty, duplicate, or out-of-range weekdays", () => {
    expect(validateScheduleRule({ mode: "fixed_weekdays", weekdays: [] })).toEqual({
      weekdays: "请至少选择一个星期"
    });
    expect(validateScheduleRule({ mode: "fixed_weekdays", weekdays: [1, 1, 3] })).toEqual({
      weekdays: "星期选择不能重复"
    });
    expect(validateScheduleRule({ mode: "fixed_weekdays", weekdays: [1, 7] })).toEqual({
      weekdays: "星期选择应在 0–6 之间"
    });
  });
});

describe("getScheduleDensity", () => {
  it("converts a cadence rule into weekly training density", () => {
    expect(getScheduleDensity({ mode: "cadence", trainDays: 3, restDays: 1 })).toBe(5.25);
  });

  it("counts selected weekdays as weekly training density", () => {
    expect(getScheduleDensity({ mode: "fixed_weekdays", weekdays: [1, 2, 3, 4, 5] })).toBe(5);
  });
});

describe("getScheduleRuleLabel", () => {
  it("labels cadence rules with Chinese numerals", () => {
    expect(getScheduleRuleLabel({ mode: "cadence", trainDays: 3, restDays: 1 })).toBe("练三休一");
  });

  it("labels fixed weekday rules with the matching preset label", () => {
    expect(getScheduleRuleLabel({ mode: "fixed_weekdays", weekdays: [1, 2, 3, 4, 5] })).toBe(
      "工作日训练、周末双休"
    );
  });
});

describe("schedule presets", () => {
  it("offers a weekday-training weekend-rest preset", () => {
    expect(weekdayPresets.find((preset) => preset.id === "weekday-training-weekend-rest")?.weekdays).toEqual([
      1, 2, 3, 4, 5
    ]);
  });

  it("offers a train-three rest-one cadence preset", () => {
    expect(cadencePresets.find((preset) => preset.id === "cadence-3-1")).toMatchObject({
      mode: "cadence",
      trainDays: 3,
      restDays: 1
    });
  });
});
