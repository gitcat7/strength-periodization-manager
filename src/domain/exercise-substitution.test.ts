import { describe, expect, it } from "vitest";

import { isExerciseSubstitutionEligible } from "./exercise-substitution";

const source = {
  id: "source",
  catalogExternalId: "0334",
  movementPattern: "shoulder_abduction",
  substitutionEnabled: true,
  trainingDirection: "push"
};

const compatibleAlternative = {
  id: "target",
  catalogExternalId: "0178",
  movementPattern: "shoulder_abduction",
  substitutionEnabled: true,
  trainingDirection: "push"
};

describe("isExerciseSubstitutionEligible", () => {
  it.each(["scheduled", "draft"] as const)("allows an unstarted accessory in a %s workout", (workoutStatus) => {
    expect(
      isExerciseSubstitutionEligible({
        alternatives: [compatibleAlternative],
        hasCompletedSet: false,
        orderIndex: 3,
        source,
        workoutStatus
      })
    ).toBe(true);
  });

  it.each(["completed", "skipped"] as const)("rejects a %s workout", (workoutStatus) => {
    expect(
      isExerciseSubstitutionEligible({
        alternatives: [compatibleAlternative],
        hasCompletedSet: false,
        orderIndex: 3,
        source,
        workoutStatus
      })
    ).toBe(false);
  });

  it.each([1, 2])("rejects protected position %i", (orderIndex) => {
    expect(
      isExerciseSubstitutionEligible({
        alternatives: [compatibleAlternative],
        hasCompletedSet: false,
        orderIndex,
        source,
        workoutStatus: "scheduled"
      })
    ).toBe(false);
  });

  it("rejects an exercise with a completed set", () => {
    expect(
      isExerciseSubstitutionEligible({
        alternatives: [compatibleAlternative],
        hasCompletedSet: true,
        orderIndex: 3,
        source,
        workoutStatus: "scheduled"
      })
    ).toBe(false);
  });

  it.each([
    ["disabled", { ...source, substitutionEnabled: false }],
    ["unmapped", { ...source, catalogExternalId: null }]
  ])("rejects a %s source", (_label, ineligibleSource) => {
    expect(
      isExerciseSubstitutionEligible({
        alternatives: [compatibleAlternative],
        hasCompletedSet: false,
        orderIndex: 3,
        source: ineligibleSource,
        workoutStatus: "scheduled"
      })
    ).toBe(false);
  });

  it("rejects when no compatible alternative is available", () => {
    expect(
      isExerciseSubstitutionEligible({
        alternatives: [
          { ...compatibleAlternative, movementPattern: "elbow_extension" },
          { ...compatibleAlternative, trainingDirection: "pull" },
          { ...compatibleAlternative, substitutionEnabled: false }
        ],
        hasCompletedSet: false,
        orderIndex: 3,
        source,
        workoutStatus: "scheduled"
      })
    ).toBe(false);
  });
});
