import {
  filterExerciseCatalog,
  findExerciseCatalogRecord,
  type ExerciseCatalogFilters,
  type ExerciseCatalogRecord,
  type ExerciseCatalogSummary
} from "../../domain/exercise-catalog";

export type ExerciseLibraryFilterOptions = {
  bodyParts: string[];
  equipment: string[];
  targets: string[];
};

export type ExerciseLibraryState = {
  filterOptions: ExerciseLibraryFilterOptions;
  results: ExerciseCatalogSummary[];
  selectedExternalId: string | null;
  selectedRecord: ExerciseCatalogRecord | null;
};

type DeriveExerciseLibraryStateInput = {
  filters?: ExerciseCatalogFilters;
  programExternalIds?: Iterable<string>;
  records: readonly ExerciseCatalogRecord[];
  selectedExternalId?: string | null;
};

export function deriveExerciseLibraryState({
  filters = {},
  programExternalIds,
  records,
  selectedExternalId = null
}: DeriveExerciseLibraryStateInput): ExerciseLibraryState {
  const results = filterExerciseCatalog(records, {
    ...filters,
    programExternalIds
  });
  const selectedResult = results.find((record) => record.externalId === selectedExternalId) ?? results[0] ?? null;
  const resolvedSelectedExternalId = selectedResult?.externalId ?? null;

  return {
    filterOptions: {
      bodyParts: getSortedValues(records, (record) => record.bodyPart),
      equipment: getSortedValues(records, (record) => record.equipment),
      targets: getSortedValues(records, (record) => record.target)
    },
    results,
    selectedExternalId: resolvedSelectedExternalId,
    selectedRecord: resolvedSelectedExternalId
      ? findExerciseCatalogRecord(records, resolvedSelectedExternalId)
      : null
  };
}

function getSortedValues(
  records: readonly ExerciseCatalogRecord[],
  getValue: (record: ExerciseCatalogRecord) => string
) {
  return [...new Set(records.map(getValue))].sort((left, right) => left.localeCompare(right));
}
