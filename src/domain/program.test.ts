import { describe, expect, it } from "vitest";

import { buildFourWeekProgram, buildSchedulePreview, getTemplateType, resolveProfileWorkingWeight, validateScheduleAndTemplate } from "./program";

const profiles = [
  { id: "bench", slug: "bench_press", workingWeight: 100, increment: 2.5 },
  { id: "row", slug: "barbell_row", workingWeight: 80, increment: 2.5 },
  { id: "squat", slug: "back_squat", workingWeight: 120, increment: 5 }
];

describe("buildFourWeekProgram", () => {
  it("rejects fixed weekdays that do not match the requested weekly frequency", () => {
    expect(validateScheduleAndTemplate({
      templateType: "three_split",
      trainingDaysPerWeek: 3,
      schedule: { mode: "fixed_weekdays", weekdays: [1, 3] }
    })).toEqual({ ok: false, message: "固定星期已选 2 天，请选择 3 天以匹配每周训练天数。" });
  });

  it("rejects cadence that exceeds the user's weekly training frequency", () => {
    expect(validateScheduleAndTemplate({
      templateType: "three_split",
      trainingDaysPerWeek: 3,
      schedule: { mode: "cadence", trainDays: 3, restDays: 1 }
    })).toEqual({ ok: false, message: "当前练休循环平均每周超过 3 天训练，请增加休息日或调整每周训练天数。" });
  });

  it("chooses compatible defaults for three, four and seven weekly training days", () => {
    expect(getTemplateType(3)).toBe("three_split");
    expect(getTemplateType(4)).toBe("four_day_upper_lower");
    expect(getTemplateType(7)).toBe("push_pull_squat");
    expect(validateScheduleAndTemplate({
      templateType: "five_split",
      trainingDaysPerWeek: 3,
      schedule: { mode: "fixed_weekdays", weekdays: [1, 3, 5] }
    })).toEqual({ ok: false, message: "五分化适合每周 5 天训练；请调整训练天数或选择匹配的模板。" });
  });

  it("removes structured movement restrictions without inferring meaning from notes", () => {
    const workouts = buildFourWeekProgram({
      templateType: "three_split",
      schedule: { mode: "fixed_weekdays", weekdays: [1, 3, 5] },
      trainingDaysPerWeek: 3,
      exerciseProfiles: profiles,
      restrictions: ["avoid_overhead_press", "avoid_deadlift_hip_hinge"],
      startDate: new Date("2026-07-13T00:00:00")
    }).filter((workout) => workout.dayType === "training");

    expect(workouts.flatMap((workout) => workout.exercises.map((exercise) => exercise.exerciseSlug))).not.toEqual(
      expect.arrayContaining(["overhead_press", "deadlift", "romanian_deadlift"])
    );
  });

  it("blocks a direction when combined restrictions leave no safe controlled replacement", () => {
    expect(() => buildFourWeekProgram({
      templateType: "three_split",
      schedule: { mode: "fixed_weekdays", weekdays: [1, 3, 5] },
      trainingDaysPerWeek: 3,
      exerciseProfiles: profiles,
      restrictions: ["avoid_deep_knee_flexion", "avoid_deadlift_hip_hinge"],
      startDate: new Date("2026-07-13T00:00:00")
    })).toThrow("当前限制条件下，腿部训练没有可安全替代的动作，请调整限制或咨询专业人士后再生成计划。");
  });
  it("uses training max instead of a higher estimated 1RM", () => {
    expect(resolveProfileWorkingWeight({ estimatedOneRepMax: 120, trainingMax: 100 })).toBe(100);
  });

  it("prescribes a more conservative beginner hypertrophy plan than an intermediate strength plan", () => {
    const baseInput = {
      templateType: "push_pull_squat" as const,
      schedule: { mode: "fixed_weekdays" as const, weekdays: [1, 3, 5] },
      exerciseProfiles: profiles,
      startDate: new Date("2026-07-13T00:00:00")
    };

    const beginnerHypertrophy = buildFourWeekProgram({
      ...baseInput,
      experienceLevel: "beginner",
      goal: "hypertrophy"
    });
    const intermediateStrength = buildFourWeekProgram({
      ...baseInput,
      experienceLevel: "intermediate",
      goal: "strength"
    });

    const beginnerBench = beginnerHypertrophy[0].dayType === "training"
      ? beginnerHypertrophy[0].exercises.find((exercise) => exercise.exerciseSlug === "bench_press")
      : undefined;
    const intermediateBench = intermediateStrength[0].dayType === "training"
      ? intermediateStrength[0].exercises.find((exercise) => exercise.exerciseSlug === "bench_press")
      : undefined;

    expect(beginnerBench).toMatchObject({ targetReps: 8, targetSets: 4, targetWeight: 75 });
    expect(intermediateBench).toMatchObject({ targetReps: 5, targetSets: 6, targetWeight: 97.5 });
  });

  it("gives powerlifting and hypertrophy plans distinct main-lift priorities", () => {
    const baseInput = {
      templateType: "push_pull_squat" as const,
      schedule: { mode: "fixed_weekdays" as const, weekdays: [1, 3, 5] },
      exerciseProfiles: profiles,
      experienceLevel: "intermediate" as const,
      startDate: new Date("2026-07-13T00:00:00")
    };
    const powerlifting = buildFourWeekProgram({ ...baseInput, goal: "strength" });
    const hypertrophy = buildFourWeekProgram({ ...baseInput, goal: "hypertrophy" });
    const firstBench = (items: typeof powerlifting) => {
      const workout = items[0];
      return workout.dayType === "training"
        ? workout.exercises.find((exercise) => exercise.exerciseSlug === "bench_press")
        : undefined;
    };

    expect(firstBench(powerlifting)).toMatchObject({ targetSets: 6, targetReps: 5, targetWeight: 97.5 });
    expect(firstBench(hypertrophy)).toMatchObject({ targetSets: 6, targetReps: 8, targetWeight: 80 });
  });

  it("keeps accessory prescriptions independent from a stronger main lift", () => {
    const baseInput = {
      templateType: "push_pull_squat" as const,
      schedule: { mode: "fixed_weekdays" as const, weekdays: [1, 3, 5] },
      experienceLevel: "novice" as const,
      goal: "hypertrophy" as const,
      startDate: new Date("2026-07-13T00:00:00")
    };
    const withRegularBench = buildFourWeekProgram({
      ...baseInput,
      exerciseProfiles: [...profiles, { id: "raise", slug: "lateral_raise", workingWeight: 8, increment: 2.5 }]
    });
    const withStrongerBench = buildFourWeekProgram({
      ...baseInput,
      exerciseProfiles: [
        ...profiles.map((profile) => profile.slug === "bench_press" ? { ...profile, workingWeight: 160 } : profile),
        { id: "raise", slug: "lateral_raise", workingWeight: 8, increment: 2.5 }
      ]
    });
    const lateralRaise = (items: typeof withRegularBench) => {
      const workout = items[0];
      return workout.dayType === "training"
        ? workout.exercises.find((exercise) => exercise.exerciseSlug === "lateral_raise")
        : undefined;
    };

    expect(lateralRaise(withRegularBench)).toMatchObject({ targetReps: 12, targetWeight: 7.5 });
    expect(lateralRaise(withStrongerBench)).toMatchObject({ targetReps: 12, targetWeight: 7.5 });
  });

  it("reduces fat-loss volume only when the user's deficit trend and recovery indicate high strain", () => {
    const baseInput = {
      templateType: "push_pull_squat" as const,
      schedule: { mode: "fixed_weekdays" as const, weekdays: [1, 3, 5] },
      exerciseProfiles: profiles,
      experienceLevel: "novice" as const,
      goal: "fat_loss" as const,
      startDate: new Date("2026-07-13T00:00:00")
    };
    const sustainable = buildFourWeekProgram({
      ...baseInput,
      nutritionAdherence: "high",
      proteinTargetMet: true,
      recoveryStatus: "normal",
      currentBodyWeightKg: 80,
      targetWeightChangeKgPerWeek: -0.3,
      weightChangeLast14DaysKg: -0.6
    });
    const highStrain = buildFourWeekProgram({
      ...baseInput,
      nutritionAdherence: "low",
      proteinTargetMet: false,
      recoveryStatus: "low",
      currentBodyWeightKg: 80,
      targetWeightChangeKgPerWeek: -0.8,
      weightChangeLast14DaysKg: -1.6
    });
    const firstBench = (items: typeof sustainable) => {
      const workout = items[0];
      return workout.dayType === "training"
        ? workout.exercises.find((exercise) => exercise.exerciseSlug === "bench_press")
        : undefined;
    };

    expect(firstBench(sustainable)).toMatchObject({ targetSets: 3 });
    expect(firstBench(highStrain)).toMatchObject({ targetSets: 2 });
  });

  it("creates a conservative beginner plan without inventing main-lift weights", () => {
    const workouts = buildFourWeekProgram({
      templateType: "three_split",
      schedule: { mode: "fixed_weekdays", weekdays: [1, 3, 5] },
      exerciseProfiles: [],
      experienceLevel: "beginner",
      goal: "hypertrophy",
      startDate: new Date("2026-07-13T00:00:00")
    });
    const workout = workouts.find((item) => item.dayType === "training");

    expect(workout?.exercises[0]).toMatchObject({ targetSets: 3, targetWeight: 0 });
  });

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

  it("generates the selected number of weeks and repeats the four-week loading block", () => {
    const workouts = buildFourWeekProgram({
      templateType: "three_split",
      schedule: { mode: "fixed_weekdays", weekdays: [1, 3, 5] },
      exerciseProfiles: profiles,
      startDate: new Date("2026-07-13T00:00:00"),
      weekCount: 6
    }).filter((workout) => workout.dayType === "training");

    expect(workouts).toHaveLength(18);
    expect(workouts.at(-1)?.name).toBe("第 6 周 · 腿");
    expect(workouts[3]?.exercises[0]?.targetWeight).toBe(100);
    expect(workouts[15]?.exercises[0]?.targetWeight).toBe(100);
  });

  it("treats twelve selected weeks as twelve calendar weeks for every template", () => {
    const workouts = buildFourWeekProgram({
      templateType: "one_split",
      schedule: { mode: "fixed_weekdays", weekdays: [1, 3, 5] },
      exerciseProfiles: profiles,
      startDate: new Date("2026-07-13T00:00:00"),
      weekCount: 12
    }).filter((workout) => workout.dayType === "training");

    expect(workouts).toHaveLength(36);
    expect(workouts.at(-1)).toMatchObject({
      name: "第 12 周 · 全身训练",
      scheduledDate: "2026-10-02"
    });
  });

  it("keeps sequence order when flexible scheduling only supplies suggested dates", () => {
    const workouts = buildFourWeekProgram({
      templateType: "one_split",
      schedule: { mode: "flexible" },
      exerciseProfiles: profiles,
      startDate: new Date("2026-07-13T00:00:00"),
      trainingDaysPerWeek: 3
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
    expect(trainingWorkouts[3]?.scheduledDate).toBe("2026-07-20");
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
      endDate: "2026-08-08",
      restDays: 13,
      trainingDays: 14
    });
  });
});
