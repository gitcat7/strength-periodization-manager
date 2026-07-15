export function getScheduleItemPresentation(item: {
  dayType: "training" | "rest";
  status: string;
}): { icon: "dumbbell" | "moon"; statusLabel: string; title: string } {
  if (item.dayType === "rest") {
    return { icon: "moon", statusLabel: item.status === "completed" ? "已完成休息" : "恢复日", title: "休息/恢复日" };
  }

  return { icon: "dumbbell", statusLabel: item.status === "completed" ? "已完成" : "训练日", title: "训练日" };
}
