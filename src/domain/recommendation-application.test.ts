import { describe, expect, it } from "vitest";

import { applyRecommendationWeight } from "./recommendation-application";

describe("applyRecommendationWeight", () => {
  it("preserves intensity, volume, and deload weight differences", () => {
    expect(applyRecommendationWeight({ currentWeight: 75, previousWeight: 75, appliedWeight: 77.5, increment: 2.5 })).toBe(77.5);
    expect(applyRecommendationWeight({ currentWeight: 62.5, previousWeight: 75, appliedWeight: 77.5, increment: 2.5 })).toBe(65);
    expect(applyRecommendationWeight({ currentWeight: 67.5, previousWeight: 75, appliedWeight: 77.5, increment: 2.5 })).toBe(70);
  });
});
