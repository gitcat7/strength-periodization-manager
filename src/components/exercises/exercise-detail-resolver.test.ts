import { describe, expect, it, vi } from "vitest";
import type { ExerciseCatalogRecord } from "../../domain/exercise-catalog";
import { getLocalExerciseGuidance } from "../../domain/exercise-guidance";
import { resolveExerciseDetail } from "./exercise-detail-resolver";

const catalogRecord: ExerciseCatalogRecord = {
  bodyPart: "chest",
  category: "strength",
  equipment: "barbell",
  externalId: "0025",
  instructionsZh: "保持肩胛稳定。",
  muscleGroup: "push",
  nameEn: "Barbell Bench Press",
  nameZh: "卧推",
  secondaryMuscles: ["triceps"],
  target: "pectorals"
};

describe("resolveExerciseDetail", () => {
  it("uses local Zone 2 guidance without invoking the catalog loader", async () => {
    const loadCatalogRecord = vi.fn(async () => catalogRecord);

    await expect(
      resolveExerciseDetail({
        catalogExternalId: null,
        exerciseSlug: "cardio_zone2",
        getLocalGuidance: getLocalExerciseGuidance,
        loadCatalogRecord
      })
    ).resolves.toEqual({
      localGuidance: getLocalExerciseGuidance("cardio_zone2"),
      record: null
    });
    expect(loadCatalogRecord).not.toHaveBeenCalled();
  });

  it("loads catalog detail only when the resolver is invoked for a catalog exercise", async () => {
    const loadCatalogRecord = vi.fn(async () => catalogRecord);

    expect(loadCatalogRecord).not.toHaveBeenCalled();
    await expect(
      resolveExerciseDetail({
        catalogExternalId: "0025",
        exerciseSlug: "barbell_bench_press",
        getLocalGuidance: getLocalExerciseGuidance,
        loadCatalogRecord
      })
    ).resolves.toEqual({ localGuidance: null, record: catalogRecord });
    expect(loadCatalogRecord).toHaveBeenCalledOnce();
    expect(loadCatalogRecord).toHaveBeenCalledWith("0025");
  });
});
