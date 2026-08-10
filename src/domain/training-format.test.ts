import { expect, it } from "vitest";
import { formatPrescription } from "./training-format";

it("explains zero-weight beginner prescriptions as a technique starting point", () => {
  expect(formatPrescription({
    slug: "bench_press",
    targetSets: 3,
    targetReps: 8,
    targetWeight: 0
  })).toBe("3 组 x 8 次 · 从空杆或最轻可控重量开始");
});

it("keeps bodyweight prescriptions free of a barbell-starting instruction", () => {
  expect(formatPrescription({
    slug: "pull_up",
    targetSets: 3,
    targetReps: 8,
    targetWeight: 0
  })).toBe("3 组 x 8 次");
});
