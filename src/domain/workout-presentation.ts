export type WorkoutPresentationTone =
  | "completed"
  | "error"
  | "intensity"
  | "neutral"
  | "recovery"
  | "upcoming";

export type WorkoutPresentationIcon = "check" | "dumbbell" | "moon" | "target";

export interface WorkoutPresentation {
  accentClass: string;
  icon: WorkoutPresentationIcon;
  label: string;
  tone: WorkoutPresentationTone;
}

export function getWorkoutPresentation(input: {
  dayType?: "rest" | "training";
  status: "completed" | "draft" | "scheduled" | "skipped";
  variant?: "pr" | "standard";
}): WorkoutPresentation {
  if (input.status === "completed") {
    return {
      accentClass: "ui-completed",
      icon: "check",
      label: "已完成",
      tone: "completed"
    };
  }

  if (input.status === "skipped" || input.status === "draft") {
    return {
      accentClass: "ui-neutral",
      icon: "dumbbell",
      label: input.status === "skipped" ? "已跳过" : "草稿",
      tone: "neutral"
    };
  }

  if (input.dayType === "rest") {
    return {
      accentClass: "ui-recovery",
      icon: "moon",
      label: "休息/恢复日",
      tone: "recovery"
    };
  }

  if (input.variant === "pr") {
    return {
      accentClass: "ui-intensity",
      icon: "target",
      label: "PR 目标",
      tone: "intensity"
    };
  }

  return {
    accentClass: "ui-upcoming",
    icon: "dumbbell",
    label: "待执行",
    tone: "upcoming"
  };
}

export interface TodayHeaderView {
  primaryActionLabel: string;
  progressLabel: string;
  tone: WorkoutPresentationTone;
}

export function buildTodayHeaderView({
  completedSets,
  totalSets,
  workoutName
}: {
  completedSets: number;
  totalSets: number;
  workoutName: string;
}): TodayHeaderView {
  const isCompleted = completedSets >= totalSets && totalSets > 0;
  const progressLabel = `${completedSets}/${totalSets} 组`;

  let primaryActionLabel: string;
  if (isCompleted) {
    primaryActionLabel = "训练已完成";
  } else if (completedSets === 0) {
    primaryActionLabel = "开始训练";
  } else {
    primaryActionLabel = "继续完成训练";
  }

  return {
    primaryActionLabel,
    progressLabel,
    tone: isCompleted ? "completed" : "upcoming"
  };
}

export interface RestDayView {
  icon: WorkoutPresentationIcon;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  tone: WorkoutPresentationTone;
}

export function buildRestDayView({
  scheduledDate,
  workoutName
}: {
  scheduledDate: string;
  workoutName: string;
}): RestDayView {
  return {
    icon: "moon",
    primaryActionLabel: "完成休息",
    secondaryActionLabel: "查看下一节训练",
    tone: "recovery"
  };
}
