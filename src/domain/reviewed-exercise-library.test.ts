import { describe, expect, it } from "vitest";
import { reviewedExercises, searchReviewedExercises } from "./reviewed-exercise-library";

describe("reviewed exercise library", () => {
  it("contains a finite beginner-friendly product library", () => {
    expect(reviewedExercises.length).toBeGreaterThanOrEqual(80);
    expect(reviewedExercises.length).toBeLessThanOrEqual(150);
    expect(reviewedExercises).toContainEqual(expect.objectContaining({
      nameZh: "杠铃卧推",
      equipment: expect.any(Array),
      primaryMuscles: expect.any(Array),
      movementPattern: expect.any(String)
    }));
  });

  it("ranks the Chinese standard name before aliases and English names", () => {
    const results = searchReviewedExercises("卧推", "全部");

    expect(results[0]).toMatchObject({ nameZh: "杠铃卧推" });
    expect(results).toContainEqual(expect.objectContaining({ nameZh: "哑铃卧推" }));
  });

  it("shows readable leg actions for the default section browse", () => {
    const results = searchReviewedExercises("", "腿");

    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ nameZh: "杠铃深蹲", movementPattern: "深蹲" }),
      expect.objectContaining({ nameZh: "罗马尼亚硬拉", movementPattern: "髋铰链" })
    ]));
  });
});
