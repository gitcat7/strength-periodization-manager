import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = resolve(process.cwd(), "supabase/migrations/20260729233000_workout_duration_tracking.sql");
const schema = resolve(process.cwd(), "supabase/schema.sql");
const standalonePgtap = resolve(process.cwd(), "supabase/tests/standalone_workout_drafts.test.sql");

describe("workout duration SQL contract", () => {
  it("keeps duration tracking schema and RPCs in migration and clean schema", () => {
    const schemaSql = readFileSync(schema, "utf8");
    const sql = `${readFileSync(migration, "utf8")}\n${schemaSql}`;
    expect(sql).toMatch(/started_at\s+timestamptz/i);
    expect(sql).toMatch(/duration_seconds\s+integer/i);
    expect(sql).toMatch(/duration_seconds\s+between\s+60\s+and\s+43200/i);
    expect(sql).toMatch(/create or replace function public\.start_training_workout/i);
    expect(sql).toMatch(/coalesce\(started_at,\s*now\(\)\)/i);
    expect(sql).toMatch(/p_duration_seconds\s+integer/i);
    expect(sql).toMatch(/completed_at[\s\S]*duration_seconds/i);
    expect(sql).toMatch(/'started_at',\s*v_workout\.started_at/i);
    expect(schemaSql).toMatch(/create or replace function public\.start_training_workout/i);
    expect(schemaSql).toMatch(/save_standalone_workout_legacy/i);
  });

  it("can restore the historical migration without renaming the standalone validator twice", () => {
    const sql = readFileSync(migration, "utf8");

    expect(sql).toMatch(/to_regprocedure\('public\.save_standalone_workout_legacy\(jsonb\)'\)/i);
    expect(sql).toMatch(/create or replace function public\.save_standalone_workout\(p_payload jsonb\)/i);
    expect(sql).not.toMatch(/alter function public\.save_standalone_workout_legacy\([^)]*\)\s+rename/i);
  });

  it("keeps the public standalone RPC JSONB contract separate from its internal UUID validator", () => {
    const migrationSql = readFileSync(migration, "utf8");
    const schemaSql = readFileSync(schema, "utf8");
    const pgtapSql = readFileSync(standalonePgtap, "utf8");

    for (const sql of [migrationSql, schemaSql]) {
      expect(sql).toMatch(/create or replace function public\.save_standalone_workout\(p_payload jsonb\)\s*returns jsonb/i);
      expect(sql).toMatch(/revoke all on function public\.save_standalone_workout_legacy\(jsonb\) from public, anon, authenticated/i);
      expect(sql).toMatch(/v_workout_id\s*:=\s*public\.save_standalone_workout_legacy\(/i);
      expect(sql).toMatch(/jsonb_build_object\(\s*'workout_id'[\s\S]*'started_at'[\s\S]*'duration_seconds'/i);
    }
    expect(schemaSql).toMatch(/save_standalone_workout_legacy\(p_payload jsonb\)\s*returns uuid/i);

    expect(pgtapSql).toMatch(/function_returns\(\s*'public',\s*'save_standalone_workout',\s*array\['jsonb'\],\s*'jsonb'/i);
    expect(pgtapSql).toMatch(/save_standalone_workout\([\s\S]*->>\s*'workout_id'[\s\S]*::uuid/i);
  });
});
