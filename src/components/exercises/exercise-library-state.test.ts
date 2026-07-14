import { describe, expect, it } from "vitest";
import type { ExerciseCatalogRecord } from "../../domain/exercise-catalog";
import { deriveExerciseLibraryState } from "./exercise-library-state";

const records: ExerciseCatalogRecord[] = [
  {
    bodyPart: "chest",
    category: "strength",
    equipment: "barbell",
    externalId: "0025",
    instructionsZh: "保持肩胛稳定。",
    muscleGroup: "push",
    nameEn: "Barbell Bench Press",
    nameZh: "杠铃卧推",
    secondaryMuscles: ["triceps"],
    target: "pectorals"
  },
  {
    bodyPart: "back",
    category: "strength",
    equipment: "cable",
    externalId: "0233",
    instructionsZh: "肘部向后拉。",
    muscleGroup: "pull",
    nameEn: "Face Pull",
    nameZh: "面拉",
    secondaryMuscles: ["traps"],
    target: "delts"
  },
  {
    bodyPart: "chest",
    category: "strength",
    equipment: "barbell",
    externalId: "0314",
    instructionsZh: "控制下放。",
    muscleGroup: "push",
    nameEn: "Incline Bench Press",
    nameZh: "上斜杠铃卧推",
    secondaryMuscles: ["triceps"],
    target: "pectorals"
  }
];

describe("deriveExerciseLibraryState", () => {
  it("derives sorted options and selects the first filtered result", () => {
    const state = deriveExerciseLibraryState({ records });

    expect(state.filterOptions).toEqual({
      bodyParts: ["back", "chest"],
      equipment: ["barbell", "cable"],
      targets: ["delts", "pectorals"]
    });
    expect(state.results.map((record) => record.externalId)).toEqual(["0025", "0233", "0314"]);
    expect(state.selectedExternalId).toBe("0025");
    expect(state.selectedRecord?.nameZh).toBe("卧推");
  });

  it("retains a selected result when filters change without excluding it", () => {
    const state = deriveExerciseLibraryState({
      filters: { bodyPart: "chest" },
      records,
      selectedExternalId: "0314"
    });

    expect(state.results.map((record) => record.externalId)).toEqual(["0025", "0314"]);
    expect(state.selectedExternalId).toBe("0314");
    expect(state.selectedRecord?.externalId).toBe("0314");
  });

  it("limits results to mapped program external IDs when requested", () => {
    const state = deriveExerciseLibraryState({
      filters: { programOnly: true },
      programExternalIds: ["0233", "0314"],
      records
    });

    expect(state.results.map((record) => record.externalId)).toEqual(["0233", "0314"]);
    expect(state.selectedExternalId).toBe("0233");
  });

  it("reports an empty state and clears an excluded selection", () => {
    const state = deriveExerciseLibraryState({
      filters: { query: "不存在" },
      records,
      selectedExternalId: "0025"
    });

    expect(state.results).toEqual([]);
    expect(state.selectedExternalId).toBeNull();
    expect(state.selectedRecord).toBeNull();
  });
});
