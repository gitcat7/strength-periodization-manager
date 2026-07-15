import { describe, expect, it } from "vitest";
import { getScheduleItemPresentation } from "./rest-day-presentation";

describe("getScheduleItemPresentation", () => {
  it("formats completed rest without strength metrics", () => {
    expect(getScheduleItemPresentation({ dayType: "rest", status: "completed" })).toEqual({
      icon: "moon",
      statusLabel: "已完成休息",
      title: "休息/恢复日"
    });
  });
});
