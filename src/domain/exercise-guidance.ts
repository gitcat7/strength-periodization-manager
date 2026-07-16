export type LocalExerciseGuidance = {
  externalId: null;
  nameEn: string;
  nameZh: string;
  equipment: string;
  target: string;
  instructionsZh: string;
};

const localExerciseGuidance: Readonly<Record<string, LocalExerciseGuidance>> = Object.freeze({
  cardio_zone2: {
    externalId: null,
    nameEn: "Zone 2 cardio",
    nameZh: "Zone 2 有氧",
    equipment: "自选有氧器械",
    target: "心肺基础与恢复",
    instructionsZh:
      "以可以完整说短句、但呼吸明显加快的强度持续训练。优先保持稳定节奏，不追求冲刺；如出现胸痛、眩晕或异常气短，立即停止。"
  }
});

export function getLocalExerciseGuidance(slug: string, name?: string): LocalExerciseGuidance | null {
  const knownGuidance = localExerciseGuidance[slug];
  if (knownGuidance) return knownGuidance;
  if (!name?.trim()) return null;

  return {
    externalId: null,
    nameEn: name,
    nameZh: name,
    equipment: "按计划或可用器械",
    target: "按训练方向与动作模式执行",
    instructionsZh: "先使用能够稳定控制全程的重量，保持动作轨迹与呼吸稳定。出现疼痛、明显代偿或动作轨迹失控时，停止并寻求合格教练评估。"
  };
}
