import type { PauseReason, ResumeRoute } from "@/domain/schedule-adjustment";

export type ReflowAction = "extra_rest" | "resume" | "holiday_override" | "unavailable_dates";

export type ReflowScheduleItem = {
  workoutId: string;
  scheduledDate: string;
  scheduleIndex: number;
  sequenceIndex: number | null;
  dayType: "training" | "rest";
  status: "scheduled" | "skipped";
};

export type ReflowInput = {
  programId: string;
  expectedRevision: number;
  action: ReflowAction;
  effectiveDate: string;
  route?: ResumeRoute;
  reason?: PauseReason;
  scheduleItems: ReflowScheduleItem[];
};

export type ScheduleReflowPayload = {
  program_id: string;
  action: ReflowAction;
  expected_revision: number;
  resume_route?: ResumeRoute;
  effective_date: string;
  reason?: PauseReason;
  schedule_items: Array<{
    workout_id: string;
    scheduled_date: string;
    schedule_index: number;
    sequence_index: number | null;
    day_type: "training" | "rest";
    status: "scheduled" | "skipped";
    skip_reason?: "recovery_strategy";
  }>;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Builds the exact JSON the reflow RPC accepts. Ownership is enforced by the
// database, so a user id must never be part of this payload.
export function buildScheduleReflowPayload(input: ReflowInput): ScheduleReflowPayload {
  if (!input.programId) {
    throw new Error("缺少计划标识。");
  }
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
    throw new Error("日程版本无效。");
  }
  if (!ISO_DATE_PATTERN.test(input.effectiveDate)) {
    throw new Error("生效日期应为 YYYY-MM-DD 格式。");
  }
  if (input.action === "resume" && !input.route) {
    throw new Error("恢复训练需要选择恢复路线。");
  }

  return {
    program_id: input.programId,
    action: input.action,
    expected_revision: input.expectedRevision,
    ...(input.action === "resume" && input.route ? { resume_route: input.route } : {}),
    effective_date: input.effectiveDate,
    ...(input.reason ? { reason: input.reason } : {}),
    schedule_items: input.scheduleItems.map((item) => ({
      workout_id: item.workoutId,
      scheduled_date: item.scheduledDate,
      schedule_index: item.scheduleIndex,
      sequence_index: item.sequenceIndex,
      day_type: item.dayType,
      status: item.status,
      ...(item.status === "skipped" ? { skip_reason: "recovery_strategy" as const } : {})
    }))
  };
}
