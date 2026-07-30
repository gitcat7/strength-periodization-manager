import { describe, expect, it } from "vitest";

import { buildSequenceCalendar, getTargetTrainingCount } from "./sequence-calendar";

describe("getTargetTrainingCount", () => {
  it("counts cadence training days inside the selected weeks", () => {
    expect(
      getTargetTrainingCount({
        startDate: "2026-07-13",
        trainingWeeks: 4,
        rule: { mode: "cadence", trainDays: 1, restDays: 1 }
      })
    ).toBe(14);
  });

  it("counts allowed weekdays inside the selected weeks", () => {
    expect(
      getTargetTrainingCount({
        startDate: "2026-07-13",
        trainingWeeks: 6,
        rule: { mode: "fixed_weekdays", weekdays: [1, 3, 5] }
      })
    ).toBe(18);
  });
});

describe("buildSequenceCalendar", () => {
  it("places cadence training days in sequence order", () => {
    const items = buildSequenceCalendar({
      startDate: "2026-08-03",
      targetTrainingCount: 12,
      rule: { mode: "cadence", trainDays: 3, restDays: 1 },
      constraints: []
    });

    expect(
      items
        .filter((item) => item.dayType === "training")
        .map((item) => item.scheduledDate)
        .slice(0, 7)
    ).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
      "2026-08-11"
    ]);
  });

  it("turns a blocked holiday date into a labeled rest item", () => {
    const items = buildSequenceCalendar({
      startDate: "2026-10-01",
      targetTrainingCount: 2,
      rule: { mode: "cadence", trainDays: 1, restDays: 1 },
      constraints: [{ date: "2026-10-01", kind: "holiday", allowsTraining: false, label: "国庆节" }]
    });

    expect(items[0]).toMatchObject({ dayType: "rest", blockedReasons: ["国庆节"] });
  });

  it("moves fixed-weekday training to the next allowed unblocked weekday", () => {
    const items = buildSequenceCalendar({
      startDate: "2026-08-03",
      targetTrainingCount: 2,
      rule: { mode: "fixed_weekdays", weekdays: [1, 3, 5] },
      constraints: [
        { date: "2026-08-05", kind: "personal_unavailable", allowsTraining: false, label: "出差" }
      ]
    });

    expect(
      items.filter((item) => item.dayType === "training").map((item) => item.scheduledDate)
    ).toEqual(["2026-08-03", "2026-08-07"]);
  });

  it("does not consume a cadence train or rest phase on blocked dates", () => {
    const items = buildSequenceCalendar({
      startDate: "2026-08-03",
      targetTrainingCount: 3,
      rule: { mode: "cadence", trainDays: 2, restDays: 1 },
      constraints: [{ date: "2026-08-04", kind: "holiday", allowsTraining: false, label: "节假日" }]
    });

    expect(
      items.filter((item) => item.dayType === "training").map((item) => item.scheduledDate)
    ).toEqual(["2026-08-03", "2026-08-05", "2026-08-07"]);
    expect(items[1]).toMatchObject({ dayType: "rest", blockedReasons: ["节假日"] });
  });

  it("merges multiple block reasons into one rest item with all labels", () => {
    const items = buildSequenceCalendar({
      startDate: "2026-10-01",
      targetTrainingCount: 1,
      rule: { mode: "cadence", trainDays: 1, restDays: 1 },
      constraints: [
        { date: "2026-10-01", kind: "holiday", allowsTraining: false, label: "国庆节" },
        { date: "2026-10-01", kind: "personal_unavailable", allowsTraining: false, label: "家人生日" }
      ]
    });

    const restItems = items.filter((item) => item.dayType === "rest");
    expect(restItems).toHaveLength(1);
    expect(restItems[0]?.blockedReasons).toEqual(["家人生日", "国庆节"]);
  });

  it("lets an allowing holiday override cancel a default holiday block", () => {
    const items = buildSequenceCalendar({
      startDate: "2026-10-01",
      targetTrainingCount: 1,
      rule: { mode: "cadence", trainDays: 1, restDays: 1 },
      constraints: [
        { date: "2026-10-01", kind: "holiday", allowsTraining: false, label: "国庆节" },
        { date: "2026-10-01", kind: "override", allowsTraining: true, label: "国庆节加练" }
      ]
    });

    expect(items[0]).toMatchObject({ dayType: "training", blockedReasons: [] });
  });

  it("assigns schedule and sequence indexes and stops at the final training day", () => {
    const items = buildSequenceCalendar({
      startDate: "2026-08-03",
      targetTrainingCount: 3,
      rule: { mode: "cadence", trainDays: 1, restDays: 1 },
      constraints: []
    });

    expect(
      items.map(({ dayType, scheduledDate, scheduleIndex, sequenceIndex }) => ({
        dayType,
        scheduledDate,
        scheduleIndex,
        sequenceIndex
      }))
    ).toEqual([
      { dayType: "training", scheduledDate: "2026-08-03", scheduleIndex: 0, sequenceIndex: 0 },
      { dayType: "rest", scheduledDate: "2026-08-04", scheduleIndex: 1, sequenceIndex: null },
      { dayType: "training", scheduledDate: "2026-08-05", scheduleIndex: 2, sequenceIndex: 1 },
      { dayType: "rest", scheduledDate: "2026-08-06", scheduleIndex: 3, sequenceIndex: null },
      { dayType: "training", scheduledDate: "2026-08-07", scheduleIndex: 4, sequenceIndex: 2 }
    ]);
  });

  it("throws instead of looping forever when no weekday allows training", () => {
    expect(() =>
      buildSequenceCalendar({
        startDate: "2026-08-03",
        targetTrainingCount: 1,
        rule: { mode: "fixed_weekdays", weekdays: [] },
        constraints: []
      })
    ).toThrow();
  });
});
