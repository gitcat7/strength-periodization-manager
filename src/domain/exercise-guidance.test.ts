import { describe, expect, it } from "vitest";

import { getLocalExerciseGuidance } from "./exercise-guidance";

describe("getLocalExerciseGuidance", () => {
  it("returns the reviewed local Zone 2 guidance without a catalog external ID", () => {
    expect(getLocalExerciseGuidance("cardio_zone2")).toEqual({
      externalId: null,
      nameEn: "Zone 2 cardio",
      nameZh: "Zone 2 有氧",
      equipment: "自选有氧器械",
      target: "心肺基础与恢复",
      instructionsZh:
        "以可以完整说短句、但呼吸明显加快的强度持续训练。优先保持稳定节奏，不追求冲刺；如出现胸痛、眩晕或异常气短，立即停止。"
    });
  });

  it("returns null for unknown local guidance slugs", () => {
    expect(getLocalExerciseGuidance("bench_press")).toBeNull();
  });

  it("gives an unmapped local core action local guidance instead of a third-party detail", () => {
    expect(getLocalExerciseGuidance("barbell_bench_press", "杠铃卧推")).toMatchObject({
      externalId: null,
      nameZh: "杠铃卧推"
    });
  });
});
