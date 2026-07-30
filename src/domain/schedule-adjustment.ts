export type ResumeRoute = "continue_current_cycle" | "start_next_cycle";

export type PauseReason =
  | "fatigue"
  | "time_conflict"
  | "minor_discomfort"
  | "injury"
  | "personal"
  | "other";

export type RecoveryLoadAdvice = {
  multiplier: number;
  title: string;
  message: string;
  suppressIncreases: boolean;
};

export type PendingTraining = {
  sequenceIndex: number;
  name: string;
  scheduledDate: string;
};

export type ResumePreview = {
  route: ResumeRoute;
  routeLabel: string;
  skippedSequenceIndexes: number[];
  skippedWorkoutNames: string[];
  nextSequenceIndex: number | null;
  nextWorkoutName: string | null;
  nextDirection: string;
  resumedOn: string;
  dateDeltaDays: number;
};

export function getRecoveryLoadAdvice(daysInterrupted: number): RecoveryLoadAdvice {
  const days = Math.max(0, Math.floor(daysInterrupted));

  if (days <= 3) {
    return {
      multiplier: 1,
      title: "短暂停训",
      message: "只休息了几天，可以按原计划重量恢复训练。",
      suppressIncreases: false
    };
  }

  if (days <= 13) {
    return {
      multiplier: 0.925,
      title: "停训约一到两周",
      message: "建议先用约 92.5% 的原有重量恢复一到两次训练，再回到原计划。",
      suppressIncreases: false
    };
  }

  return {
    multiplier: 0.85,
    title: "停训两周以上",
    message: "建议以约 85% 的原有重量重新开始，并在本次恢复期间暂停所有加重安排。",
    suppressIncreases: true
  };
}

export function buildResumePreview(input: {
  route: ResumeRoute;
  pendingTraining: PendingTraining[];
  templateLength: number;
  resumedOn: string;
}): ResumePreview {
  const { route, pendingTraining, templateLength, resumedOn } = input;
  const sorted = [...pendingTraining].sort((a, b) => a.sequenceIndex - b.sequenceIndex);
  const firstPending = sorted[0] ?? null;

  if (route === "continue_current_cycle") {
    return {
      route,
      routeLabel: "继续当前循环",
      skippedSequenceIndexes: [],
      skippedWorkoutNames: [],
      nextSequenceIndex: firstPending?.sequenceIndex ?? null,
      nextWorkoutName: firstPending?.name ?? null,
      nextDirection: firstPending ? describePosition(firstPending.sequenceIndex, templateLength) : "没有待训练内容",
      resumedOn,
      dateDeltaDays: firstPending ? daysBetween(firstPending.scheduledDate, resumedOn) : 0
    };
  }

  const currentCycleIndex = firstPending ? Math.floor(firstPending.sequenceIndex / templateLength) : 0;
  const skipped = sorted.filter(
    (workout) => Math.floor(workout.sequenceIndex / templateLength) === currentCycleIndex
  );
  const nextSequenceIndex = (currentCycleIndex + 1) * templateLength;

  return {
    route,
    routeLabel: "从下个循环第一节开始",
    skippedSequenceIndexes: skipped.map((workout) => workout.sequenceIndex),
    skippedWorkoutNames: skipped.map((workout) => workout.name),
    nextSequenceIndex,
    nextWorkoutName: null,
    nextDirection: describePosition(nextSequenceIndex, templateLength),
    resumedOn,
    dateDeltaDays: skipped[0] ? daysBetween(skipped[0].scheduledDate, resumedOn) : 0
  };
}

function describePosition(sequenceIndex: number, templateLength: number): string {
  const cycleIndex = Math.floor(sequenceIndex / templateLength);
  const cyclePosition = sequenceIndex % templateLength;
  return `第 ${cycleIndex + 1} 循环第 ${cyclePosition + 1} 节`;
}

function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00`).getTime();
  const to = new Date(`${toDate}T00:00:00`).getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}
