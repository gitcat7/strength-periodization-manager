type QueryResult = { data: any; error: any };

function isMissingScheduleColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === "42703" && /workouts\.(day_type|schedule_index)|day_type|schedule_index/i.test(String(candidate.message ?? ""));
}

function addLegacyScheduleFields(data: any): any {
  const normalize = (row: Record<string, unknown>) => {
    const workout = row as Record<string, unknown> & { sequence_index?: number | null };
    return {
      ...workout,
      day_type: "training",
      ...(workout.sequence_index === undefined ? {} : { schedule_index: workout.sequence_index })
    };
  };

  if (Array.isArray(data)) {
    return data.map(normalize);
  }

  return data && typeof data === "object"
    ? normalize(data)
    : data;
}

export async function loadWorkoutsWithDayTypeFallback(
  primary: () => PromiseLike<QueryResult>,
  legacy: () => PromiseLike<QueryResult>
): Promise<QueryResult & { usedLegacySchema: boolean }> {
  const primaryResult = await primary();
  if (!isMissingScheduleColumnError(primaryResult.error)) {
    return { ...primaryResult, usedLegacySchema: false };
  }

  const legacyResult = await legacy();
  return {
    ...legacyResult,
    data: addLegacyScheduleFields(legacyResult.data),
    usedLegacySchema: true
  };
}
