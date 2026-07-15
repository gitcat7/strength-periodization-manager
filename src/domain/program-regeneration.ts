import type {
  PlannedScheduleItem,
  ProgramTemplateType,
  ScheduleConfig,
  TemplateType
} from "@/domain/program";

export type ProgramReplacementPayload = {
  custom_template_name: string | null;
  end_date: string;
  name: string;
  schedule_config: Record<string, number | number[]>;
  schedule_items: Array<{
    day_type: "training" | "rest";
    exercises: Array<{
      exercise_id: string;
      order_index: number;
      target_reps: number;
      target_sets: number;
      target_weight: number;
    }>;
    name: string;
    schedule_index: number;
    scheduled_date: string;
    sequence_index: number | null;
  }>;
  schedule_mode: ScheduleConfig["mode"];
  start_date: string;
  template_type: ProgramTemplateType;
};

export function buildRegenerationPreview(input: {
  activeItems: Array<{ dayType: "training" | "rest"; status: string }>;
  proposedItems: PlannedScheduleItem[];
}): {
  endDate: string;
  restDays: number;
  trainingDays: number;
  unfinishedRestDays: number;
  unfinishedTrainingDays: number;
} {
  const proposed = input.proposedItems.reduce(
    (summary, item) => ({
      endDate: item.scheduledDate,
      restDays: summary.restDays + (item.dayType === "rest" ? 1 : 0),
      trainingDays: summary.trainingDays + (item.dayType === "training" ? 1 : 0)
    }),
    { endDate: "", restDays: 0, trainingDays: 0 }
  );

  const unfinished = input.activeItems.reduce(
    (summary, item) => {
      if (item.status === "completed") return summary;
      if (item.dayType === "training") summary.unfinishedTrainingDays += 1;
      else summary.unfinishedRestDays += 1;
      return summary;
    },
    { unfinishedRestDays: 0, unfinishedTrainingDays: 0 }
  );

  return { ...proposed, ...unfinished };
}

export function buildProgramReplacementPayload({
  customTemplateName = null,
  exerciseIdsBySlug,
  plannedItems,
  programTemplateType,
  schedule,
  templateType
}: {
  customTemplateName?: string | null;
  exerciseIdsBySlug: ReadonlyMap<string, string>;
  plannedItems: PlannedScheduleItem[];
  programTemplateType?: ProgramTemplateType;
  schedule: ScheduleConfig;
  templateType: TemplateType;
}): ProgramReplacementPayload {
  const startDate = plannedItems[0]?.scheduledDate;
  const endDate = plannedItems.at(-1)?.scheduledDate;
  if (!startDate || !endDate) throw new Error("计划日程不能为空。");

  return {
    custom_template_name: customTemplateName,
    end_date: endDate,
    name: getProgramName(templateType),
    schedule_config: getScheduleConfig(schedule),
    schedule_items: plannedItems.map((item) => ({
      day_type: item.dayType,
      exercises:
        item.dayType === "rest"
          ? []
          : item.exercises.map((exercise, index) => {
              const exerciseId = exerciseIdsBySlug.get(exercise.exerciseSlug);
              if (!exerciseId) throw new Error(`缺少动作 ${exercise.exerciseSlug} 的数据。`);
              return {
                exercise_id: exerciseId,
                order_index: index + 1,
                target_reps: exercise.targetReps,
                target_sets: exercise.targetSets,
                target_weight: exercise.targetWeight
              };
            }),
      name: item.name,
      schedule_index: item.scheduleIndex,
      scheduled_date: item.scheduledDate,
      sequence_index: item.sequenceIndex
    })),
    schedule_mode: schedule.mode,
    start_date: startDate,
    template_type: programTemplateType ?? templateType
  };
}

export function getProgramName(templateType: TemplateType) {
  if (templateType === "push_pull_squat") return "推/拉/蹲 A-B 周期";
  if (templateType === "one_split") return "一分化全身循环";
  if (templateType === "three_split" || templateType === "three_day_full_body") return "三分化训练循环";
  if (templateType === "five_split" || templateType === "four_day_upper_lower") return "五分化训练循环";
  return "训练循环";
}

export function getScheduleConfig(schedule: ScheduleConfig): Record<string, number | number[]> {
  if (schedule.mode === "fixed_weekdays") return { weekdays: schedule.weekdays };
  if (schedule.mode === "cadence") return { train_days: schedule.trainDays ?? 1, rest_days: schedule.restDays };
  return {};
}
