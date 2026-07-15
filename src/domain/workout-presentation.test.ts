import { describe, expect, it } from "vitest";
import { getWorkoutPresentation } from "./workout-presentation";

describe("getWorkoutPresentation", () => {
  it("uses recovery semantics for a scheduled rest day", () => {
    expect(getWorkoutPresentation({ dayType: "rest", status: "scheduled" })).toEqual({
      accentClass: "ui-recovery",
      icon: "moon",
      label: "休息/恢复日",
      tone: "recovery"
    });
  });

  it("uses intensity semantics for an active PR target", () => {
    expect(getWorkoutPresentation({ status: "scheduled", variant: "pr" })).toMatchObject({
      icon: "target",
      tone: "intensity"
    });
  });

  it("uses completed semantics for a completed training day", () => {
    expect(getWorkoutPresentation({ dayType: "training", status: "completed" })).toEqual({
      accentClass: "ui-completed",
      icon: "check",
      label: "已完成",
      tone: "completed"
    });
  });

  it("uses completed semantics for a completed rest day", () => {
    expect(getWorkoutPresentation({ dayType: "rest", status: "completed" })).toEqual({
      accentClass: "ui-completed",
      icon: "check",
      label: "已完成",
      tone: "completed"
    });
  });

  it("uses upcoming semantics for a scheduled training day", () => {
    expect(getWorkoutPresentation({ dayType: "training", status: "scheduled" })).toEqual({
      accentClass: "ui-upcoming",
      icon: "dumbbell",
      label: "待执行",
      tone: "upcoming"
    });
  });

  it("uses neutral semantics for a skipped day", () => {
    expect(getWorkoutPresentation({ dayType: "training", status: "skipped" })).toEqual({
      accentClass: "ui-neutral",
      icon: "dumbbell",
      label: "已跳过",
      tone: "neutral"
    });
  });

  it("uses neutral semantics for a draft day", () => {
    expect(getWorkoutPresentation({ dayType: "training", status: "draft" })).toEqual({
      accentClass: "ui-neutral",
      icon: "dumbbell",
      label: "草稿",
      tone: "neutral"
    });
  });

  it("uses upcoming semantics as default when only status is provided", () => {
    expect(getWorkoutPresentation({ status: "scheduled" })).toEqual({
      accentClass: "ui-upcoming",
      icon: "dumbbell",
      label: "待执行",
      tone: "upcoming"
    });
  });

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
