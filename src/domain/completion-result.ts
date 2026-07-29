import type { RecommendationType } from "./fitness-coach";

export type CompletionRecommendation = { exercise_id: string; previous_weight: number; reason: string; recommendation_type: RecommendationType; suggested_weight: number; status: string };

export function parseCompletionResult(value: unknown): { durationSeconds: number | null; recommendations: CompletionRecommendation[]; status: "completed"; workoutId: string } {
  if (!value || typeof value !== "object") throw new Error("INVALID_COMPLETION_RESULT");
  const result = value as Record<string, unknown>;
  if (typeof result.workout_id !== "string" || result.status !== "completed" || !Array.isArray(result.recommendations)) throw new Error("INVALID_COMPLETION_RESULT");
  const recommendations = result.recommendations.map((item) => {
    if (!item || typeof item !== "object") throw new Error("INVALID_COMPLETION_RESULT");
    const row = item as Record<string, unknown>;
    if (typeof row.exercise_id !== "string" || typeof row.previous_weight !== "number" || typeof row.suggested_weight !== "number" || typeof row.reason !== "string" || typeof row.recommendation_type !== "string" || typeof row.status !== "string") throw new Error("INVALID_COMPLETION_RESULT");
    return row as CompletionRecommendation;
  });
  return { durationSeconds: typeof result.duration_seconds === "number" ? result.duration_seconds : null, recommendations, status: "completed", workoutId: result.workout_id };
}
