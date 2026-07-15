import { describe, expect, it } from "vitest";

import { canCompleteRestDay, getTodayScheduleState } from "./rest-day-state";

describe("getTodayScheduleState", () => {
  it("shows a date-exact rest day without consuming the next strength session", () => {
    const state = getTodayScheduleState({
      now: "2026-07-14",
      restItems: [{ dayType: "rest", id: "rest-1", scheduledDate: "2026-07-14", status: "scheduled" }],
      trainingItems: [
        {
          dayType: "training",
          id: "train-1",
          name: "拉 B · 容量",
          scheduledDate: "2026-07-16",
          sequenceIndex: 1,
          status: "scheduled"
        }
      ]
    });

    expect(state).toMatchObject({ kind: "rest", nextTraining: { id: "train-1" } });
  });

  it("keeps training visible when a rest item is completed or scheduled for another date", () => {
    const training = {
      dayType: "training" as const,
      id: "train-1",
      name: "推 A · 强度",
      scheduledDate: "2026-07-14",
      sequenceIndex: 0,
      status: "scheduled"
    };

    expect(
      getTodayScheduleState({
        now: "2026-07-14",
        restItems: [{ dayType: "rest", id: "rest-done", scheduledDate: "2026-07-14", status: "completed" }],
        trainingItems: [training]
      })
    ).toEqual({ kind: "training", workout: training });

    expect(
      getTodayScheduleState({
        now: "2026-07-14",
        restItems: [{ dayType: "rest", id: "rest-later", scheduledDate: "2026-07-15", status: "scheduled" }],
        trainingItems: [training]
      })
    ).toEqual({ kind: "training", workout: training });
  });
});

describe("canCompleteRestDay", () => {
  it("rejects training, completed, and unknown statuses", () => {
    expect(canCompleteRestDay({ dayType: "rest", status: "scheduled" })).toBe(true);
    expect(canCompleteRestDay({ dayType: "rest", status: "draft" })).toBe(true);
    expect(canCompleteRestDay({ dayType: "training", status: "scheduled" })).toBe(false);
    expect(canCompleteRestDay({ dayType: "rest", status: "completed" })).toBe(false);
    expect(canCompleteRestDay({ dayType: "rest", status: "skipped" })).toBe(false);
  });
});
