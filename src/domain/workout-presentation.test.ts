import { describe, expect, it } from "vitest";
import {
  buildTodayHeaderView,
  buildRestDayView,
  getWorkoutPresentation
} from "./workout-presentation";

describe("buildTodayHeaderView", () => {
  it("keeps the next action ahead of secondary metrics for in-progress training", () => {
    const view = buildTodayHeaderView({ completedSets: 3, totalSets: 16, workoutName: "推 A · 强度" });
    expect(view.primaryActionLabel).toBe("继续完成训练");
    expect(view.progressLabel).toBe("3/16 组");
    expect(view.tone).toBe("upcoming");
  });

  it("shows completed state when all sets are done", () => {
    const view = buildTodayHeaderView({ completedSets: 16, totalSets: 16, workoutName: "推 A · 强度" });
    expect(view.primaryActionLabel).toBe("训练已完成");
    expect(view.progressLabel).toBe("16/16 组");
    expect(view.tone).toBe("completed");
  });

  it("shows fresh start when no sets completed", () => {
    const view = buildTodayHeaderView({ completedSets: 0, totalSets: 16, workoutName: "拉 B · 容量" });
    expect(view.primaryActionLabel).toBe("开始训练");
    expect(view.progressLabel).toBe("0/16 组");
    expect(view.tone).toBe("upcoming");
  });
});

describe("buildRestDayView", () => {
  it("shows recovery semantics for a rest day", () => {
    const view = buildRestDayView({ scheduledDate: "2026-07-15", workoutName: "有氧日 · 恢复" });
    expect(view.primaryActionLabel).toBe("完成休息");
    expect(view.secondaryActionLabel).toBe("查看下一节训练");
    expect(view.tone).toBe("recovery");
    expect(view.icon).toBe("moon");
  });
});

describe("getWorkoutPresentation", () => {
  it("makes upcoming strength and completed recovery visually distinct", () => {
    const training = getWorkoutPresentation({ dayType: "training", status: "scheduled" });
    const rest = getWorkoutPresentation({ dayType: "rest", status: "completed" });

    expect(training.tone).toBe("upcoming");
    expect(rest.tone).toBe("completed");
    expect(training.accentClass).not.toBe(rest.accentClass);
  });

  it("selects intensity orange for PR variant rather than completed green", () => {
    const pr = getWorkoutPresentation({ status: "scheduled", variant: "pr" });
    const completed = getWorkoutPresentation({ status: "completed" });

    expect(pr.tone).toBe("intensity");
    expect(pr.accentClass).toBe("ui-intensity");
    expect(completed.tone).toBe("completed");
    expect(completed.accentClass).toBe("ui-completed");
    expect(pr.accentClass).not.toBe(completed.accentClass);
  });
});
