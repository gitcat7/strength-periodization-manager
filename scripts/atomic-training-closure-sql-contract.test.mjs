import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = resolve(process.cwd(), "supabase/migrations/20260730010000_atomic_training_completion_and_recommendations.sql");
const schema = resolve(process.cwd(), "supabase/schema.sql");

describe("atomic training closure SQL contract", () => {
  it("keeps completion, recommendations, and completed-set guards in one database contract", () => {
    const schemaSql = readFileSync(schema, "utf8");
    const sql = `${readFileSync(migration, "utf8")}\n${schemaSql}`;
    expect(sql).toMatch(/replace_pending_workout_recommendations/i);
    expect(sql).toMatch(/revise_completed_workout_logs/i);
    expect(sql).toMatch(/delete from public\.log_recommendations[\s\S]*status = 'pending'/i);
    expect(sql).toMatch(/target_attainment/i);
    expect(sql).toMatch(/actual_weight[\s\S]*target_weight/i);
    expect(sql).toMatch(/actual_reps[\s\S]*target_reps/i);
    expect(sql).toMatch(/jsonb_build_object\('recommendations'/i);
    expect(sql).toMatch(/completed set is invalid/i);
    expect(schemaSql).toMatch(/create or replace function public\.complete_training_workout\(/i);
    expect(schemaSql).toMatch(/v_recommendations := public\.replace_pending_workout_recommendations/i);
  });
});
