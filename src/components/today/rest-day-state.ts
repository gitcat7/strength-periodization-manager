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

export function getTodayScheduleState(input: {
  now: string;
  restItems: RestScheduleItem[];
  trainingItems: TrainingScheduleItem[];
}):
  | { kind: "rest"; restItem: RestScheduleItem; nextTraining: TrainingScheduleItem | null }
  | { kind: "training"; workout: TrainingScheduleItem }
  | { kind: "empty" } {
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
  onRestQueryError: (error: unknown) => void;
  restItems: Promise<RestScheduleItem[]>;
  trainingItems: Promise<TrainingScheduleItem[]>;
}) {
  const restItems = await input.restItems.catch((error) => {
    input.onRestQueryError(error);
    return [];
  });
  const trainingItems = await input.trainingItems;

  return getTodayScheduleState({ now: input.now, restItems, trainingItems });
}

export function reportRestCompletionFailure(error: unknown): string {
  console.warn("rest day completion failed", error);
  return "完成休息失败，请检查网络后重试。";
}
