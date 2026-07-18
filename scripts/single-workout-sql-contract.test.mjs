import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const migrationPath = new URL("../supabase/migrations/20260716090000_standalone_workouts.sql", import.meta.url);
const draftMigrationPath = new URL("../supabase/migrations/20260716093000_standalone_workout_drafts.sql", import.meta.url);
const p0MigrationPath = new URL("../supabase/migrations/20260716150000_p0_workout_recording.sql", import.meta.url);
const phaseOneMigrationPath = new URL("../supabase/migrations/20260718160000_phase1_recording_safety.sql", import.meta.url);
const schemaPath = new URL("../supabase/schema.sql", import.meta.url);
const databaseTestPath = new URL("../supabase/tests/standalone_workout_drafts.test.sql", import.meta.url);
const packagePath = new URL("../package.json", import.meta.url);

describe("standalone workout migration", () => {
  test("permits owned training workouts without a program while retaining RLS ownership", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/alter column program_id drop not null/i);
    expect(sql).toMatch(/workouts\.program_id is null/i);
    expect(sql).toMatch(/auth\.uid\(\) = workouts\.user_id/i);
    expect(sql).toMatch(/workout\.program_id is null/i);
  });

  test("keeps draft RPCs, ownership grants, and schema initialization in sync", async () => {
    const [draftMigration, p0Migration, phaseOneMigration, schema, databaseTest, packageJson] = await Promise.all([
      readFile(draftMigrationPath, "utf8"),
      readFile(p0MigrationPath, "utf8"),
      readFile(phaseOneMigrationPath, "utf8"),
      readFile(schemaPath, "utf8"),
      readFile(databaseTestPath, "utf8"),
      readFile(packagePath, "utf8")
    ]);

    for (const sql of [draftMigration, schema]) {
      expect(sql).toMatch(/create or replace function public\.save_standalone_workout\(p_payload jsonb\)/i);
      expect(sql).toMatch(/create or replace function public\.get_standalone_workout_draft\(\)/i);
      expect(sql).toMatch(/v_user_id uuid := auth\.uid\(\)/i);
      expect(sql).toMatch(/grant execute on function public\.save_standalone_workout\(jsonb\) to authenticated/i);
      expect(sql).toMatch(/grant execute on function public\.get_standalone_workout_draft\(\) to authenticated/i);
    }
    expect(schema).toMatch(/create or replace function public\.create_standalone_workout\(p_payload jsonb\)/i);
    for (const sql of [p0Migration, phaseOneMigration, schema]) {
      expect(sql).toMatch(/exercise_provider = 'manual'/i);
      expect(sql).toMatch(/exercise_provider = 'reviewed'/i);
      expect(sql).toMatch(/v_user_id uuid := auth\.uid\(\)/i);
    }
    for (const sql of [phaseOneMigration, schema]) {
      expect(sql).toMatch(/v_requires_rpe boolean/i);
      expect(sql).toMatch(/reviewed:treadmill-run/i);
      expect(sql).toMatch(/reviewed exercise load type is invalid/i);
      expect(sql).toMatch(/v_requires_rpe and v_rpe is null/i);
      expect(sql).toMatch(/completed standalone set is incomplete/i);
    }
    expect(schema).not.toMatch(/\\n\+--|\+Exit code:/);
    expect(databaseTest).toMatch(/set local role authenticated/i);
    expect(databaseTest).toMatch(/another user cannot read the owner draft/i);
    expect(databaseTest).toMatch(/invalid draft payload is rejected/i);
    expect(databaseTest).toMatch(/invalid NaN weight is rejected/i);
    expect(databaseTest).toMatch(/manual action is stored only as a workout snapshot/i);
    expect(databaseTest).toMatch(/completed standalone set requires repetitions/i);
    expect(databaseTest).toMatch(/reviewed cardio can omit RPE/i);
    expect(databaseTest).toMatch(/untrusted reviewed metadata cannot omit RPE/i);
    expect(databaseTest).toMatch(/reviewed strength action cannot spoof a bodyweight load type/i);
    expect(databaseTest).toMatch(/grant all on table standalone_test_state to authenticated/i);
    expect(draftMigration).toMatch(/'floor_crunch', '卷腹', 'cardio'/i);
    expect(schema).toMatch(/'floor_crunch', '卷腹', 'cardio'/i);
    expect(JSON.parse(packageJson).scripts["test:db"]).toMatch(/supabase.*test db/i);
  });
});
