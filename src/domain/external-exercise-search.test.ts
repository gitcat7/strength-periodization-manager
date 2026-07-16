import { describe, expect, it } from "vitest";
import { filterExternalExerciseSearchResults, type ExerciseSearchSection } from "./external-exercise-search";

const exercises = [
  { category: "Chest", equipment: ["Barbell"], externalId: "1", muscles: ["Pectoralis major"], name: "Bench press", provider: "wger" as const, sourceUrl: "https://wger.de/1" },
  { category: "Legs", equipment: ["Barbell"], externalId: "2", muscles: ["Quadriceps"], name: "Barbell squat", provider: "wger" as const, sourceUrl: "https://wger.de/2" }
];

describe("external exercise search results", () => {
  it("shows every matching result until the user actively selects a category", () => {
    expect(filterExternalExerciseSearchResults(exercises, "全部", new Set())).toEqual(exercises);
    expect(filterExternalExerciseSearchResults(exercises, "腿", new Set())).toEqual([exercises[1]]);
  });

  it("excludes only exercises that the user has already added", () => {
    expect(filterExternalExerciseSearchResults(exercises, "全部", new Set(["2"]))).toEqual([exercises[0]]);
  });

  it("keeps the available categories explicit", () => {
    const sections: ExerciseSearchSection[] = ["全部", "胸", "背", "腿", "肩", "手臂", "核心", "全身"];
    expect(sections).toContain("全部");
  });
});
