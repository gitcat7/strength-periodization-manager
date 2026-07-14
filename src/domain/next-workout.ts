export type NextWorkoutState =
  | { kind: "today" }
  | { kind: "upcoming"; daysUntil: number }
  | { kind: "overdue"; overdueDays: number };

export function getNextWorkoutState(scheduledDate: string, now = new Date()): NextWorkoutState {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const suggestedDate = new Date(`${scheduledDate}T00:00:00`);
  const dayDifference = Math.round((suggestedDate.getTime() - today.getTime()) / 86400000);

  if (dayDifference < 0) return { kind: "overdue", overdueDays: Math.abs(dayDifference) };
  if (dayDifference === 0) return { kind: "today" };
  return { kind: "upcoming", daysUntil: dayDifference };
}
