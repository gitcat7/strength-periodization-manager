import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const migrationPath = new URL("../supabase/migrations/20260821010000_scientific_review_and_prescription_guardrails.sql", import.meta.url);
const schemaPath = new URL("../supabase/schema.sql", import.meta.url);
const packagePath = new URL("../package.json", import.meta.url);

describe("scientific review SQL contract", () => {
  test("keeps recommendation generation atomic, idempotent, and user-scoped", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("coach_revision");
    expect(sql).toContain("source_revision");
    expect(sql).toContain("log_recommendations_pending_source_idx");
    expect(sql).toContain("create or replace function public.complete_training_workout");
    expect(sql).toContain("create or replace function public.revise_completed_workout_logs");
    expect(sql).toContain("v_user_id uuid := auth.uid()");
    expect(sql).toContain("where id = p_workout_id and user_id = v_user_id for update");
    expect(sql).toContain("security definer");
  });

  test("requires preview and explicit application for pending recommendations", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("create or replace function public.preview_recommendation_application");
    expect(sql).toContain("create or replace function public.apply_recommendation");
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain("log_workout_prescription_revisions");
  });

  test("keeps the schema baseline and a dedicated pgTAP command aligned", async () => {
    const [schema, packageJson] = await Promise.all([readFile(schemaPath, "utf8"), readFile(packagePath, "utf8")]);
    const pkg = JSON.parse(packageJson);
    expect(schema).toContain("log_workout_prescription_revisions");
    expect(schema).toContain("preview_workout_prescription_revision");
    expect(pkg.scripts["test:db:science"]).toContain("scientific_review_guardrails.test.sql");
  });
});
