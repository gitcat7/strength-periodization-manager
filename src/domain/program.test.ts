import { describe, expect, it } from "vitest";

import { buildFourWeekProgram, buildSchedulePreview } from "./program";

const profiles = [
  { id: "bench", slug: "bench_press", workingWeight: 100, increment: 2.5 },
  { id: "row", slug: "barbell_row", workingWeight: 80, increment: 2.5 },
  { id: "squat", slug: "back_squat", workingWeight: 120, increment: 5 }
];

describe("buildFourWeekProgram", () => {
  it("assigns a stable zero-based sequence index without changing fixed-weekday dates", () => {
    const workouts = buildFourWeekProgram({
      templateType: "three_day_full_body",
      availableWeekdays: [1, 3, 5],
      exerciseProfiles: profiles,
      startDate: new Date("2026-07-13T00:00:00")
    });

    const trainingWorkouts = workouts.filter((workout) => workout.dayType === "training");

    expect(trainingWorkouts.map((workout) => workout.sequenceIndex)).toEqual(
      Array.from({ length: 12 }, (_, index) => index)
    );
    expect(trainingWorkouts.slice(0, 3).map((workout) => workout.scheduledDate)).toEqual([
      "2026-07-13",
      "2026-07-15",
      "2026-07-17"
    ]);
  });

  it("builds a cadence plan from the selected template instead of weekdays", () => {
    const workouts = buildFourWeekProgram({
      templateType: "three_split",
      schedule: { mode: "cadence", restDays: 1 },
      exerciseProfiles: profiles,
      startDate: new Date("2026-07-13T00:00:00")
    });

    const trainingWorkouts = workouts.filter((workout) => workout.dayType === "training");

    expect(trainingWorkouts.slice(0, 3).map((workout) => workout.scheduledDate)).toEqual([
      "2026-07-13",
      "2026-07-15",
      "2026-07-17"
    ]);
    expect(trainingWorkouts.slice(0, 3).map((workout) => workout.name)).toEqual([
      "第 1 周 · 胸肩三头",
      "第 1 周 · 背二头",
      "第 1 周 · 腿"
    ]);
  });

  it("keeps sequence order when flexible scheduling only supplies suggested dates", () => {
    const workouts = buildFourWeekProgram({
      templateType: "one_split",
      schedule: { mode: "flexible" },
      exerciseProfiles: profiles,
      startDate: new Date("2026-07-13T00:00:00")
    });

    const trainingWorkouts = workouts.filter((workout) => workout.dayType === "training");

    expect(workouts).toHaveLength(trainingWorkouts.length);
    expect(workouts.every((workout) => workout.dayType === "training")).toBe(true);
    expect(trainingWorkouts.slice(0, 3).map((workout) => workout.sequenceIndex)).toEqual([0, 1, 2]);
    expect(trainingWorkouts.slice(0, 3).map((workout) => workout.scheduledDate)).toEqual([
      "2026-07-13",
      "2026-07-14",
      "2026-07-15"
    ]);
  });

  it("groups three training days before a one-day rest in a cadence cycle", () => {
    const workouts = buildFourWeekProgram({
      templateType: "three_split",
      schedule: { mode: "cadence", trainDays: 3, restDays: 1 },
      exerciseProfiles: profiles,
      startDate: new Date("2026-07-13T00:00:00")
    });

    const trainingWorkouts = workouts.filter((workout) => workout.dayType === "training");

    expect(trainingWorkouts.slice(0, 5).map((workout) => workout.scheduledDate)).toEqual([
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
      "2026-07-17",
      "2026-07-18"
    ]);
  });

  it("expands train one rest one into explicit continuous schedule items", () => {
    const items = buildFourWeekProgram({
      templateType: "three_split",
      schedule: { mode: "cadence", trainDays: 1, restDays: 1 },
      exerciseProfiles: profiles,
      startDate: new Date("2026-07-13T00:00:00")
    });

    expect(
      items.slice(0, 5).map(({ dayType, scheduledDate, sequenceIndex, scheduleIndex }) => ({
        dayType,
        scheduledDate,
        sequenceIndex,
        scheduleIndex
      }))
    ).toEqual([
      { dayType: "training", scheduledDate: "2026-07-13", sequenceIndex: 0, scheduleIndex: 0 },
      { dayType: "rest", scheduledDate: "2026-07-14", sequenceIndex: null, scheduleIndex: 1 },
      { dayType: "training", scheduledDate: "2026-07-15", sequenceIndex: 1, scheduleIndex: 2 },
      { dayType: "rest", scheduledDate: "2026-07-16", sequenceIndex: null, scheduleIndex: 3 },
      { dayType: "training", scheduledDate: "2026-07-17", sequenceIndex: 2, scheduleIndex: 4 }
    ]);
  });

  it("fills fixed weekday gaps with rest days and does not append a tail rest day", () => {
    const items = buildFourWeekProgram({
      templateType: "three_split",
      schedule: { mode: "fixed_weekdays", weekdays: [1, 3, 5] },
      exerciseProfiles: profiles,
      startDate: new Date("2026-07-13T00:00:00")
    });

    expect(items[1]).toMatchObject({
      dayType: "rest",
      exercises: [],
      name: "休息/恢复日",
      scheduledDate: "2026-07-14",
      sequenceIndex: null,
      scheduleIndex: 1
    });
    expect(items.at(-1)?.dayType).toBe("training");
  });

  it("keeps flexible schedules training-only and summarizes the schedule item counts", () => {
    const flexibleItems = buildFourWeekProgram({
      templateType: "one_split",
      schedule: { mode: "flexible" },
      exerciseProfiles: profiles,
      startDate: new Date("2026-07-13T00:00:00")
    });
    const cadenceItems = buildFourWeekProgram({
      templateType: "three_split",
      schedule: { mode: "cadence", restDays: 1 },
      exerciseProfiles: profiles,
      startDate: new Date("2026-07-13T00:00:00")
    });

    expect(flexibleItems.every((item) => item.dayType === "training")).toBe(true);
    expect(flexibleItems.map((item) => item.scheduleIndex)).toEqual(
      Array.from({ length: flexibleItems.length }, (_, index) => index)
    );
    expect(buildSchedulePreview(cadenceItems)).toEqual({
      endDate: "2026-08-04",
      restDays: 11,
      trainingDays: 12
    });
  });
});
