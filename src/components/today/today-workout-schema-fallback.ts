type DatabaseError = {
  code?: string | null;
  message?: string | null;
} | null;

export function shouldRetryWithBaseExerciseSchema(error: DatabaseError): boolean {
  return error?.code === "42703" && /catalog_external_id/i.test(error.message ?? "");
}
