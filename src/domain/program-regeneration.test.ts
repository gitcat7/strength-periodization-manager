import { describe, expect, it } from "vitest";

import {
  buildProgramReplacementPayload,
  buildRegenerationPreview
} from "./program-regeneration";
import type { PlannedScheduleItem } from "./program";

const proposedItems: PlannedScheduleItem[] = [
  {
    dayType: "training" as const,
    exercises: [
      {
        exerciseSlug: "bench_press",
        targetSets: 3,
        targetReps: 8,
        targetWeight: 80
      }
    ],
    name: "第 1 周 · 推 A · 强度",
    scheduledDate: "2026-07-13",
    scheduleIndex: 0,
    sequenceIndex: 0
  },
  {
    dayType: "rest" as const,
    exercises: [],
    name: "休息/恢复日" as const,
    scheduledDate: "2026-07-14",
    scheduleIndex: 1,
    sequenceIndex: null
  }
];

describe("buildRegenerationPreview", () => {
  it("summarizes the proposed schedule and unfinished active training and rest days", () => {
    expect(
      buildRegenerationPreview({
        activeItems: [
          { dayType: "training", status: "scheduled" },
          { dayType: "training", status: "completed" },
          { dayType: "rest", status: "draft" },
          { dayType: "rest", status: "completed" }
        ],
        proposedItems
      })
    ).toEqual({
      endDate: "2026-07-14",
      restDays: 1,
      trainingDays: 1,
      unfinishedRestDays: 1,
      unfinishedTrainingDays: 1
    });
  });
});

describe("buildProgramReplacementPayload", () => {
  it("converts mixed schedule items into the RPC payload without prescriptions on rest days", () => {
    expect(
      buildProgramReplacementPayload({
        customTemplateName: null,
        exerciseIdsBySlug: new Map([["bench_press", "exercise-1"]]),
        plannedItems: proposedItems,
        schedule: { mode: "cadence", trainDays: 1, restDays: 1 },
        templateType: "push_pull_squat"
      })
    ).toEqual({
      custom_template_name: null,
      end_date: "2026-07-14",
      name: "推/拉/蹲 A-B 周期",
      schedule_config: { train_days: 1, rest_days: 1 },
      schedule_items: [
        {
          day_type: "training",
          exercises: [
            {
              exercise_id: "exercise-1",
              order_index: 1,
              target_reps: 8,
              target_sets: 3,
              target_weight: 80
            }
          ],
          name: "第 1 周 · 推 A · 强度",
          schedule_index: 0,
          scheduled_date: "2026-07-13",
          sequence_index: 0
        },
        {
          day_type: "rest",
          exercises: [],
          name: "休息/恢复日",
          schedule_index: 1,
          scheduled_date: "2026-07-14",
          sequence_index: null
        }
      ],
      schedule_mode: "cadence",
      start_date: "2026-07-13",
      template_type: "push_pull_squat"
    });
  });
});
