export type RestScheduleItem = {
  dayType: string;
  id: string;
  scheduledDate: string;
  status: string;
};

export type TrainingScheduleItem = {
  dayType: string;
  id: string;
  name: string;
  scheduledDate?: string;
  sequenceIndex: number;
  status: string;
};

export type TodayScheduleState =
  | { kind: "training"; workout: TrainingScheduleItem }
  | { kind: "rest"; restItem: RestScheduleItem; nextTraining: TrainingScheduleItem | null }
  | { kind: "paused"; resumeDate: string | null }
  | { kind: "adjustment_required"; eventId: string }
  | { kind: "empty" };

export function getTodayScheduleState(input: {
  now: string;
  // Pass pausedUntil only while the program is paused; null means no planned resume date.
  pausedUntil?: string | null;
  pendingAdjustment?: { id: string } | null;
  restItems: RestScheduleItem[];
  trainingItems: TrainingScheduleItem[];
}): TodayScheduleState {
  if (input.pendingAdjustment) {
    return { kind: "adjustment_required", eventId: input.pendingAdjustment.id };
  }
  if (input.pausedUntil !== undefined) {
    return { kind: "paused", resumeDate: input.pausedUntil };
  }

  const restItem = input.restItems.find(
    (item) => item.dayType === "rest" && item.scheduledDate === input.now && canCompleteRestDay(item)
  );
  const nextTraining = input.trainingItems.find(
    (item) => item.dayType === "training" && (item.status === "scheduled" || item.status === "draft")
  );

  if (restItem) return { kind: "rest", restItem, nextTraining: nextTraining ?? null };
  if (nextTraining) return { kind: "training", workout: nextTraining };
  return { kind: "empty" };
}

export function canCompleteRestDay(item: { dayType: string; status: string }): boolean {
  return item.dayType === "rest" && (item.status === "scheduled" || item.status === "draft");
}

export async function resolveTodayScheduleState(input: {
  now: string;
  pausedUntil?: string | null;
  pendingAdjustment?: { id: string } | null;
  onRestQueryError: (error: unknown) => void;
  restItems: Promise<RestScheduleItem[]>;
  trainingItems: Promise<TrainingScheduleItem[]>;
}) {
  const restItems = await input.restItems.catch((error) => {
    input.onRestQueryError(error);
    return [];
  });
  const trainingItems = await input.trainingItems;

  return getTodayScheduleState({
    now: input.now,
    ...(input.pausedUntil !== undefined ? { pausedUntil: input.pausedUntil } : {}),
    ...(input.pendingAdjustment ? { pendingAdjustment: input.pendingAdjustment } : {}),
    restItems,
    trainingItems
  });
}

export function reportRestCompletionFailure(error: unknown): string {
  console.warn("rest day completion failed", error);
  return "完成休息失败，请检查网络后重试。";
}
