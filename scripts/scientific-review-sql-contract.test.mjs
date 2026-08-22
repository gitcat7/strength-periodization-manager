import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const migrationPath = new URL("../supabase/migrations/20260821010000_scientific_review_and_prescription_guardrails.sql", import.meta.url);
const protectionMigrationPath = new URL("../supabase/migrations/20260821020000_scientific_review_protection_rules.sql", import.meta.url);
const schemaPath = new URL("../supabase/schema.sql", import.meta.url);
const packagePath = new URL("../package.json", import.meta.url);
const ruleSourcePath = new URL("../src/domain/scientific-review.ts", import.meta.url);

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

  test("locks the production protection thresholds and profile metrics contract", async () => {
    const [patch, schema, ruleSource] = await Promise.all([readFile(protectionMigrationPath, "utf8"), readFile(schemaPath, "utf8"), readFile(ruleSourcePath, "utf8")]);
    expect(patch).toContain("actual_weight");
    expect(patch).toContain("actual_reps");
    expect(patch).toContain("short_recovery_gap");
    expect(patch).toContain("v_days <= 1");
    expect(patch).toContain("nutrition_adherence");
    expect(patch).toContain("bodyweight_change_percent");
    expect(patch).toContain("profile_caution");
    expect(patch).toContain("goal_experience_mismatch");
    expect(patch).toContain("abs(w.scheduled_date - v_workout.scheduled_date) <= 1");
    expect(schema).toContain("bodyweight_change_percent");
    expect(ruleSource).toContain("shortRecoveryGapDays: 1");
    expect(ruleSource).toContain("longInterruptionDays: 14");
    expect(ruleSource).toContain("bodyweightChangePercent: 3");
    expect(patch).toContain("v_days <= 1");
    expect(patch).toContain("v_days > 14");
    expect(patch).toContain("abs(v_profile.bodyweight_change_percent) >= 3");
  });

  test("normalizes incompatible legacy profile values before enforcing new constraints", async () => {
    const patch = await readFile(protectionMigrationPath, "utf8");
    const removeLegacyNotNull = "alter column recovery_status drop not null";
    const preserveLegacyHigh = "when lower(trim(recovery_status)) = 'high' then 'normal'";
    const recoveryCleanup = "set recovery_status = null";
    const nutritionCleanup = "set nutrition_adherence = null";
    const bodyweightCleanup = "set bodyweight_change_percent = null";
    const firstConstraint = "add constraint athlete_profiles_recovery_status_check";

    expect(patch).toContain(removeLegacyNotNull);
    expect(patch).toContain(preserveLegacyHigh);
    expect(patch).toContain(nutritionCleanup);
    expect(patch).toContain(bodyweightCleanup);
    expect(patch.indexOf(removeLegacyNotNull)).toBeLessThan(patch.indexOf(firstConstraint));
    expect(patch.indexOf(preserveLegacyHigh)).toBeLessThan(patch.indexOf(firstConstraint));
    expect(patch.indexOf(nutritionCleanup)).toBeLessThan(patch.indexOf(firstConstraint));
    expect(patch.indexOf(bodyweightCleanup)).toBeLessThan(patch.indexOf(firstConstraint));
  });
});
