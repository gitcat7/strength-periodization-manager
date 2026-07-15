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
