import type { ExerciseCatalogRecord } from "../../domain/exercise-catalog";
import type { LocalExerciseGuidance } from "../../domain/exercise-guidance";

type ExerciseDetailResolverDependencies = {
  catalogExternalId: string | null | undefined;
  exerciseSlug: string;
  getLocalGuidance: (slug: string) => LocalExerciseGuidance | null;
  loadCatalogRecord: (externalId: string) => Promise<ExerciseCatalogRecord | null>;
};

export type ResolvedExerciseDetail = {
  localGuidance: LocalExerciseGuidance | null;
  record: ExerciseCatalogRecord | null;
};

export async function resolveExerciseDetail({
  catalogExternalId,
  exerciseSlug,
  getLocalGuidance,
  loadCatalogRecord
}: ExerciseDetailResolverDependencies): Promise<ResolvedExerciseDetail> {
  const localGuidance = getLocalGuidance(exerciseSlug);
  if (localGuidance) return { localGuidance, record: null };
  if (!catalogExternalId) throw new Error("未找到这项动作的详细说明。");

  const record = await loadCatalogRecord(catalogExternalId);
  if (!record) throw new Error("未找到这项动作的详细说明。");
  return { localGuidance: null, record };
}
