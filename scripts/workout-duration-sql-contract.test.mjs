import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = resolve(process.cwd(), "supabase/migrations/20260729233000_workout_duration_tracking.sql");
const schema = resolve(process.cwd(), "supabase/schema.sql");

describe("workout duration SQL contract", () => {
  it("keeps duration tracking schema and RPCs in migration and clean schema", () => {
    const sql = `${readFileSync(migration, "utf8")}\n${readFileSync(schema, "utf8")}`;
    expect(sql).toMatch(/started_at\s+timestamptz/i);
    expect(sql).toMatch(/duration_seconds\s+integer/i);
    expect(sql).toMatch(/duration_seconds\s+between\s+60\s+and\s+43200/i);
    expect(sql).toMatch(/create or replace function public\.start_training_workout/i);
    expect(sql).toMatch(/coalesce\(started_at,\s*now\(\)\)/i);
    expect(sql).toMatch(/p_duration_seconds\s+integer/i);
    expect(sql).toMatch(/completed_at[\s\S]*duration_seconds/i);
    expect(sql).toMatch(/'started_at',\s*v_workout\.started_at/i);
  });
});
