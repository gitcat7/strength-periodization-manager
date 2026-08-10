import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260730123000_history_read_edit_workflow.sql"
);
const schemaPath = resolve(process.cwd(), "supabase/schema.sql");

describe("history read/edit SQL contract", () => {
  it("atomically composes audited log revision with owned duration persistence", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");
    const schemaSql = readFileSync(schemaPath, "utf8");
    const sql = `${migrationSql}\n${schemaSql}`;
    expect(sql).toMatch(/create or replace function public\.revise_completed_workout\(/i);
    expect(sql).toMatch(/public\.revise_completed_workout_logs\(p_workout_id,\s*p_logs\)/i);
    expect(sql).toMatch(/duration_seconds[\s\S]*between 60 and 43200/i);
    expect(sql).toMatch(/id = p_workout_id[\s\S]*user_id = auth\.uid\(\)/i);
    expect(sql).toMatch(/jsonb_build_object\('duration_seconds'/i);
    expect(sql).toMatch(/grant execute on function public\.revise_completed_workout\(uuid, jsonb, integer\) to authenticated/i);
    expect(sql).not.toMatch(/rename to save_standalone_workout_legacy/i);
    expect(schemaSql).toMatch(/create or replace function public\.replace_pending_workout_recommendations/i);
    expect(schemaSql).toMatch(/create or replace function public\.revise_completed_workout_logs/i);
    expect(schemaSql).toMatch(/create or replace function public\.revise_completed_workout\(/i);
  });
});
