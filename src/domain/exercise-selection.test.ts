import { describe, expect, it } from "vitest";
import type { ExternalExerciseReference } from "./external-exercise";
import { filterAddableExternalExercises } from "./exercise-selection";

const external = (overrides: Partial<ExternalExerciseReference>): ExternalExerciseReference => ({
  category: "胸部",
  equipment: ["杠铃"],
  externalId: "42",
  muscles: ["胸大肌"],
  name: "Barbell bench press",
  provider: "wger",
  sourceUrl: "https://wger.de/en/exercise/42",
  ...overrides
});

describe("external exercise selection", () => {
  it("hides fallback and metadata-free external records", () => {
    const results = filterAddableExternalExercises([
      external({ externalId: "1", name: "其他肌群训练动作 1", equipment: [], muscles: [] }),
      external({ externalId: "2", name: "", equipment: ["杠铃"] }),
      external({ externalId: "3", name: "Bench press", equipment: [], muscles: [] })
    ], "", "全部");

    expect(results).toEqual([]);
  });

  it("ranks a Chinese exact match before readable English supplemental matches", () => {
    const results = filterAddableExternalExercises([
      external({ externalId: "1", name: "Barbell bench press" }),
      external({ externalId: "2", name: "杠铃卧推" })
    ], "杠铃卧推", "全部");

    expect(results.map((item) => item.externalId)).toEqual(["2", "1"]);
  });
});
