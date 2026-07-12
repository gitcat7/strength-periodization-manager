import type { ExerciseCatalogRecord } from "../../domain/exercise-catalog";

type ExerciseLibraryLoadDependencies = {
  loadCatalog: () => Promise<ExerciseCatalogRecord[]>;
  loadProgramExternalIds: () => Promise<string[]>;
};

export type ExerciseLibraryLoadResult = {
  bridgeError: string | null;
  programExternalIds: string[];
  records: ExerciseCatalogRecord[];
};

export async function loadExerciseLibraryData({
  loadCatalog,
  loadProgramExternalIds
}: ExerciseLibraryLoadDependencies): Promise<ExerciseLibraryLoadResult> {
  const records = await loadCatalog();

  try {
    return {
      bridgeError: null,
      programExternalIds: await loadProgramExternalIds(),
      records
    };
  } catch (error) {
    return {
      bridgeError: getErrorMessage(error),
      programExternalIds: [],
      records
    };
  }
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "计划动作映射加载失败，请稍后重试。";
}
