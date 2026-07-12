import { describe, expect, it } from "vitest";

import {
  filterExerciseCatalog,
  findExerciseCatalogRecord,
  type ExerciseCatalogRecord
} from "./exercise-catalog";
import { reviewedExerciseNamesZh } from "./exercise-catalog-names";

const records: ExerciseCatalogRecord[] = [
  {
    bodyPart: "chest",
    category: "chest",
    equipment: "barbell",
    externalId: "0025",
    instructionsZh: "缓慢下放杠铃，保持肩胛稳定。",
    muscleGroup: "triceps",
    nameEn: "barbell bench press",
    nameZh: null,
    secondaryMuscles: ["triceps"],
    target: "pectorals"
  },
  {
    bodyPart: "back",
    category: "back",
    equipment: "cable",
    externalId: "0861",
    instructionsZh: "坐稳后将把手拉向腹部。",
    muscleGroup: "rhomboids",
    nameEn: "seated cable row",
    nameZh: null,
    secondaryMuscles: ["biceps"],
    target: "lats"
  },
  {
    bodyPart: "upper arms",
    category: "upper arms",
    equipment: "cable",
    externalId: "0868",
    instructionsZh: "固定上臂，控制弯举。",
    muscleGroup: "forearms",
    nameEn: "cable biceps curl",
    nameZh: null,
    secondaryMuscles: ["forearms"],
    target: "biceps"
  }
];

describe("filterExerciseCatalog", () => {
  it("composes filters and returns stable external ID order without instructions", () => {
    expect(
      filterExerciseCatalog([...records].reverse(), {
        equipment: " CABLE ",
        bodyPart: "back",
        target: "lats",
        muscleGroup: "rhomboids"
      })
    ).toEqual([
      {
        bodyPart: "back",
        category: "back",
        equipment: "cable",
        externalId: "0861",
        muscleGroup: "rhomboids",
        nameEn: "seated cable row",
        nameZh: "坐姿划船",
        secondaryMuscles: ["biceps"],
        target: "lats"
      }
    ]);
  });

  it.each([
    ["0025", ["0025"]],
    ["BENCH", ["0025"]],
    ["坐姿划船", ["0861"]],
    ["CABLE", ["0861", "0868"]],
    ["BACK", ["0861"]],
    ["LATS", ["0861"]],
    ["FOREARMS", ["0868"]]
  ])("matches a trimmed case-insensitive query across catalog fields: %s", (query, externalIds) => {
    expect(filterExerciseCatalog(records, { query: ` ${query} ` }).map((record) => record.externalId)).toEqual(
      externalIds
    );
  });

  it("restricts program-only results to its supplied allowlist", () => {
    expect(
      filterExerciseCatalog(records, {
        programOnly: true,
        programExternalIds: new Set(["0861", "0025"])
      }).map((record) => record.externalId)
    ).toEqual(["0025", "0861"]);
  });

  it("caps results only when a limit is supplied", () => {
    expect(filterExerciseCatalog(records, { equipment: "cable" }).map((record) => record.externalId)).toEqual([
      "0861",
      "0868"
    ]);
    expect(filterExerciseCatalog(records, { equipment: "cable", limit: 1 }).map((record) => record.externalId)).toEqual([
      "0861"
    ]);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5])(
    "rejects an invalid limit: %s",
    (limit) => {
      expect(() => filterExerciseCatalog(records, { limit })).toThrow(RangeError);
    }
  );

  it("allows a zero limit", () => {
    expect(filterExerciseCatalog(records, { limit: 0 })).toEqual([]);
  });

  it("ignores an unreviewed raw Chinese name for search and display", () => {
    const unreviewedRecord: ExerciseCatalogRecord = {
      ...records[2],
      externalId: "unreviewed",
      nameZh: "未经审核的中文名称"
    };

    expect(filterExerciseCatalog([unreviewedRecord], { query: "未经审核" })).toEqual([]);
    expect(filterExerciseCatalog([unreviewedRecord])).toEqual([
      expect.objectContaining({ externalId: "unreviewed", nameZh: null })
    ]);
    expect(findExerciseCatalogRecord([unreviewedRecord], "unreviewed")).toEqual(
      expect.objectContaining({ externalId: "unreviewed", nameZh: null })
    );
  });
});

describe("findExerciseCatalogRecord", () => {
  it("returns reviewed detail with full instructions by external ID", () => {
    expect(findExerciseCatalogRecord(records, "0025")).toEqual({
      ...records[0],
      nameZh: "卧推"
    });
  });

  it("returns null for an unknown external ID", () => {
    expect(findExerciseCatalogRecord(records, "missing")).toBeNull();
  });
});

describe("reviewedExerciseNamesZh", () => {
  it("contains the exact reviewed program allowlist", () => {
    expect(reviewedExerciseNamesZh).toEqual({
      "0025": "卧推",
      "0091": "推举",
      "0314": "上斜哑铃卧推",
      "0334": "侧平举",
      "0201": "绳索下压",
      "0027": "杠铃划船",
      "2330": "高位下拉",
      "0861": "坐姿划船",
      "0233": "面拉",
      "0294": "哑铃弯举",
      "0043": "深蹲",
      "0085": "罗马尼亚硬拉",
      "0739": "腿举",
      "0599": "腿弯举",
      "0605": "站姿提踵",
      "0652": "引体向上",
      "0032": "硬拉",
      "0577": "器械推胸",
      "0603": "器械肩推",
      "0178": "绳索侧平举",
      "0200": "绳索把手下压",
      "1350": "器械坐姿划船",
      "0818": "对握高位下拉",
      "0225": "绳索反向飞鸟",
      "0868": "绳索弯举",
      "0743": "哈克深蹲",
      "1459": "哑铃罗马尼亚硬拉",
      "0586": "俯卧腿弯举",
      "1375": "绳索站姿提踵"
    });
    expect(Object.isFrozen(reviewedExerciseNamesZh)).toBe(true);
  });
});
