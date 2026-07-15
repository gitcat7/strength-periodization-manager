import { describe, expect, it } from "vitest";
import { shouldRetryWithBaseExerciseSchema } from "./today-workout-schema-fallback";

describe("shouldRetryWithBaseExerciseSchema", () => {
  it("retries the workout query when the optional catalog bridge column is absent", () => {
    expect(
      shouldRetryWithBaseExerciseSchema({
        code: "42703",
        message: "column exercises_1.catalog_external_id does not exist"
      })
    ).toBe(true);
  });

  it("does not hide unrelated database errors", () => {
    expect(
      shouldRetryWithBaseExerciseSchema({ code: "42501", message: "permission denied for table exercises" })
    ).toBe(false);
  });
});
