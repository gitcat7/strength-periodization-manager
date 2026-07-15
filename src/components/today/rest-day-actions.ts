import { canCompleteRestDay, type RestScheduleItem } from "./rest-day-state";

type RestCompletionResult = {
  data: { id: string } | null;
  error: unknown;
};

type RestUpdateQuery = {
  eq(column: string, value: string): RestUpdateQuery;
  in(column: string, values: string[]): RestUpdateQuery;
  maybeSingle(): PromiseLike<RestCompletionResult>;
  select(columns: string): RestUpdateQuery;
};

type WorkoutsQuery = {
  update(values: { completed_at: string; status: "completed" }): RestUpdateQuery;
};

export function getCurrentRestItem(item: RestScheduleItem | null | undefined, today: string): RestScheduleItem | null {
  if (!item || item.scheduledDate !== today || !canCompleteRestDay(item)) return null;
  return item;
}

export async function completeRestDayCheckIn(input: {
  from: (table: "workouts") => unknown;
  item: RestScheduleItem;
  today: string;
  userId: string;
}): Promise<RestCompletionResult> {
  if (!getCurrentRestItem(input.item, input.today)) return { data: null, error: null };

  const workouts = input.from("workouts") as WorkoutsQuery;

  return await workouts
    .update({ completed_at: new Date().toISOString(), status: "completed" })
    .eq("id", input.item.id)
    .eq("user_id", input.userId)
    .eq("day_type", "rest")
    .eq("scheduled_date", input.today)
    .in("status", ["scheduled", "draft"])
    .select("id")
    .maybeSingle();
}
