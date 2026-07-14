import { describe, expect, it } from "vitest";
import { createLatestExerciseDetailRequest } from "./exercise-detail-request";

describe("createLatestExerciseDetailRequest", () => {
  it("invalidates an older request when a newer request starts", () => {
    const requests = createLatestExerciseDetailRequest();
    const olderRequest = requests.start();
    const newerRequest = requests.start();

    expect(requests.isCurrent(olderRequest)).toBe(false);
    expect(requests.isCurrent(newerRequest)).toBe(true);
  });

  it("invalidates pending requests after unmount", () => {
    const requests = createLatestExerciseDetailRequest();
    const request = requests.start();

    requests.dispose();

    expect(requests.isCurrent(request)).toBe(false);
  });
});
