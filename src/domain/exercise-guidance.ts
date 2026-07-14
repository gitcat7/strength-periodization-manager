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

export function getLocalExerciseGuidance(slug: string): LocalExerciseGuidance | null {
  return localExerciseGuidance[slug] ?? null;
}
