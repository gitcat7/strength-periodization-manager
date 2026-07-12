import { describe, expect, it } from "vitest";
import type { ExerciseCatalogRecord } from "../../domain/exercise-catalog";
import { loadExerciseLibraryData } from "./exercise-library-load";

const catalogRecords: ExerciseCatalogRecord[] = [
  {
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
  }
];

describe("loadExerciseLibraryData", () => {
  it("keeps a successfully loaded catalog available when the optional bridge fails", async () => {
    const result = await loadExerciseLibraryData({
      loadCatalog: async () => catalogRecords,
      loadProgramExternalIds: async () => {
        throw new Error("bridge unavailable");
      }
    });

    expect(result).toEqual({
      bridgeError: "bridge unavailable",
      programExternalIds: [],
      records: catalogRecords
    });
  });

  it("rejects when catalog loading fails", async () => {
    await expect(
      loadExerciseLibraryData({
        loadCatalog: async () => {
          throw new Error("catalog unavailable");
        },
        loadProgramExternalIds: async () => ["0025"]
      })
    ).rejects.toThrow("catalog unavailable");
  });
});
