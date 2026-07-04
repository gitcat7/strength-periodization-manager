export const pushPullSquatSchedule = [
  { label: "推 A", intent: "强度", focus: "胸 / 肩 / 三头", key: "push-a" },
  { label: "拉 B", intent: "容量", focus: "背 / 后束 / 二头", key: "pull-b" },
  { label: "蹲 A", intent: "强度", focus: "下肢 / 后链", key: "squat-a" },
  { label: "有氧", intent: "恢复", focus: "Zone 2", key: "cardio" },
  { label: "推 B", intent: "容量", focus: "胸肩容量", key: "push-b" },
  { label: "拉 A", intent: "强度", focus: "背部力量", key: "pull-a" },
  { label: "蹲 B", intent: "容量", focus: "腿部容量", key: "squat-b" }
];

export function getWorkoutMeta(name: string) {
  if (name.includes("推 A")) {
    return {
      label: "推 A",
      intent: "强度",
      focus: "今日方向：推，胸/肩/三头为主",
      note: "主项低到中等次数，重量更高，重点是力量和技术质量。"
    };
  }

  if (name.includes("推 B")) {
    return {
      label: "推 B",
      intent: "容量",
      focus: "今日方向：推，胸/肩/三头容量",
      note: "中高次数和更多总量，重点是肌肥大、技术巩固和局部容量。"
    };
  }

  if (name.includes("拉 A")) {
    return {
      label: "拉 A",
      intent: "强度",
      focus: "今日方向：拉，背/后束/二头为主",
      note: "背部主动作优先，保留动作质量，不把硬拉和划船都推到极限。"
    };
  }

  if (name.includes("拉 B")) {
    return {
      label: "拉 B",
      intent: "容量",
      focus: "今日方向：拉，背部容量和后束为主",
      note: "多角度拉类动作堆积有效训练量，避免腰背过度疲劳。"
    };
  }

  if (name.includes("蹲 A")) {
    return {
      label: "蹲 A",
      intent: "强度",
      focus: "今日方向：蹲，下肢和后链为主",
      note: "深蹲主项优先，后续动作服务腿部和后链，不混入上肢主项。"
    };
  }

  if (name.includes("蹲 B")) {
    return {
      label: "蹲 B",
      intent: "容量",
      focus: "今日方向：蹲，腿部容量和后链为主",
      note: "中高次数和辅助动作提高腿部容量，强度低于蹲 A。"
    };
  }

  if (name.includes("有氧")) {
    return {
      label: "有氧",
      intent: "恢复",
      focus: "今日方向：有氧恢复",
      note: "不塞重力量训练，作为 Zone 2 恢复和心肺基础。"
    };
  }

  return {
    label: "训练",
    intent: "计划",
    focus: "今日方向：训练计划",
    note: "按计划执行，记录完成情况。"
  };
}

export function formatPrescription({
  slug,
  targetSets,
  targetReps,
  targetWeight
}: {
  slug?: string;
  targetSets: number;
  targetReps: number;
  targetWeight: number;
}) {
  if (slug === "cardio_zone2") {
    return `${targetReps} 分钟 Zone 2`;
  }

  return `${targetSets} 组 x ${targetReps} 次${targetWeight > 0 ? ` @ ${targetWeight}kg` : ""}`;
}

export function getExerciseNote(slug?: string, index = 0) {
  if (slug === "cardio_zone2") return "能说完整短句但不能唱歌，完成时间即可。";
  if (index === 0) return "主项，保留 1-2 次余量。";
  if (index === 1) return "次主项，控制动作质量。";
  if (slug?.includes("raise") || slug?.includes("curl") || slug?.includes("pushdown")) {
    return "小肌群辅助，不追求极限重量。";
  }
  return "辅助容量，动作干净，不力竭。";
}

