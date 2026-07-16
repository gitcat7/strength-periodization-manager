import { describe, expect, it } from "vitest";
import { isWgerExternalId, toExternalExerciseSnapshot } from "./external-exercise";

describe("wger external reference", () => {
  it("accepts a positive decimal wger id and snapshots only record-safe fields", () => {
    expect(isWgerExternalId("123")).toBe(true);
    expect(isWgerExternalId("0")).toBe(false);
    expect(
      toExternalExerciseSnapshot({
        provider: "wger",
        externalId: "123",
        name: "Bench press",
        muscles: ["Pectoralis major"],
        equipment: ["Barbell"],
        category: "Chest",
        sourceUrl: "https://wger.de/en/exercise/123"
      })
    ).toEqual({
      muscles: ["Pectoralis major"],
      equipment: ["Barbell"],
      category: "Chest",
      sourceUrl: "https://wger.de/en/exercise/123"
    });
  });
});
