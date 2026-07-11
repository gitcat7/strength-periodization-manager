import { reviewedExerciseNamesZh } from "./exercise-catalog-names";

export type ExerciseCatalogRecord = {
  bodyPart: string;
  category: string;
  equipment: string;
  externalId: string;
  instructionsZh: string;
  muscleGroup: string;
  nameEn: string;
  nameZh: string | null;
  secondaryMuscles: string[];
  target: string;
};

export type ExerciseCatalogManifest = {
  generatedAt: string;
  recordCount: 1324;
  schemaVersion: 1;
  dataFile: "exercises.118e4bd6.zh.json";
  sha256: string;
  sourceCommit: "118e4bd6b14da6df0e36605d7169b65db18389a4";
  sourceRepository: "https://github.com/hasaneyldrm/exercises-dataset.git";
};

export type ExerciseCatalogFilters = {
  query?: string;
  bodyPart?: string;
  equipment?: string;
  target?: string;
  muscleGroup?: string;
  programOnly?: boolean;
  programExternalIds?: Iterable<string>;
  limit?: number;
};

export type ExerciseCatalogSummary = Omit<ExerciseCatalogRecord, "instructionsZh">;

export function filterExerciseCatalog(
  records: readonly ExerciseCatalogRecord[],
  filters: ExerciseCatalogFilters = {}
): ExerciseCatalogSummary[] {
  const query = normalizeText(filters.query);
  const bodyPart = normalizeText(filters.bodyPart);
  const equipment = normalizeText(filters.equipment);
  const target = normalizeText(filters.target);
  const muscleGroup = normalizeText(filters.muscleGroup);
  const programExternalIds = filters.programOnly
    ? new Set(Array.from(filters.programExternalIds ?? [], normalizeText))
    : null;

  const matchingRecords = records
    .filter((record) => {
      const reviewedName = reviewedNameFor(record);
      const searchableFields = [
        record.externalId,
        record.nameEn,
        reviewedName ?? "",
        record.equipment,
        record.bodyPart,
        record.target,
        record.muscleGroup
      ];

      return (
        (!query || searchableFields.some((field) => normalizeText(field).includes(query))) &&
        (!bodyPart || normalizeText(record.bodyPart) === bodyPart) &&
        (!equipment || normalizeText(record.equipment) === equipment) &&
        (!target || normalizeText(record.target) === target) &&
        (!muscleGroup || normalizeText(record.muscleGroup) === muscleGroup) &&
        (!programExternalIds || programExternalIds.has(normalizeText(record.externalId)))
      );
    })
    .sort((left, right) => left.externalId.localeCompare(right.externalId));

  const limitedRecords = filters.limit === undefined
    ? matchingRecords
    : matchingRecords.slice(0, Math.max(0, Math.floor(filters.limit)));

  return limitedRecords.map(toExerciseCatalogSummary);
}

export function findExerciseCatalogRecord(
  records: readonly ExerciseCatalogRecord[],
  externalId: string
): ExerciseCatalogRecord | null {
  const record = records.find((candidate) => candidate.externalId === externalId);
  return record ? withReviewedName(record) : null;
}

function toExerciseCatalogSummary(record: ExerciseCatalogRecord): ExerciseCatalogSummary {
  const { instructionsZh: _instructionsZh, ...summary } = withReviewedName(record);
  return summary;
}

function withReviewedName(record: ExerciseCatalogRecord): ExerciseCatalogRecord {
  return {
    ...record,
    nameZh: reviewedNameFor(record)
  };
}

function reviewedNameFor(record: ExerciseCatalogRecord) {
  return reviewedExerciseNamesZh[record.externalId] ?? record.nameZh;
}

function normalizeText(value: string | undefined) {
  return value?.trim().toLocaleLowerCase() ?? "";
}
