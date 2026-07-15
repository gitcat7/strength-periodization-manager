import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../supabase/migrations/20260715110000_rest_day_schedule_and_program_replacement.sql", import.meta.url)
);
const schemaPath = fileURLToPath(new URL("../supabase/schema.sql", import.meta.url));

describe("rest-day SQL contract", () => {
  it("rest-day migration exposes protected atomic replacement", async () => {
    const [migration, schema] = await Promise.all([
      readFile(migrationPath, "utf8"),
      readFile(schemaPath, "utf8")
    ]);

    for (const sql of [migration, schema]) {
      expect(sql).toMatch(/day_type\s+text\s+not null\s+default\s+'training'/i);
      expect(sql).toMatch(/create or replace function public\.replace_active_program/i);
      expect(sql).toMatch(/auth\.uid\(\)/i);
      expect(sql).toMatch(/security definer/i);
      expect(sql).toMatch(/set search_path = public/i);
      expect(sql).toMatch(/unique\s*\(\s*program_id\s*,\s*schedule_index\s*\)/i);
      expect(sql).toMatch(/day_type\s*=\s*'rest'.*sequence_index\s+is\s+null/is);
      expect(sql).toMatch(/revoke execute on function public\.replace_active_program\(jsonb\) from public, anon/i);
      expect(sql).toMatch(/grant execute on function public\.replace_active_program\(jsonb\) to authenticated/i);
    }

    expect(schema).toMatch(/schedule_index\s+integer\s+not null/i);
    expect(migration).toMatch(/add column schedule_index integer/i);
    expect(migration).toMatch(/alter column schedule_index set not null/i);
    expect(migration).toMatch(/create constraint trigger.*schedule_index/i);
    expect(migration).toMatch(/workout_exercises.*day_type.*training/is);
    expect(migration).toMatch(/function public\.enforce_rest_workout_without_exercises/i);
    expect(migration).toMatch(/before update of day_type on public\.workouts/i);
    expect(migration).toMatch(/status\s*=\s*'archived'/i);
  });
});
