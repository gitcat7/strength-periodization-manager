import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../supabase/migrations/20260715090000_sequence_scheduling_foundation.sql", import.meta.url)
);
const templatesMigrationPath = fileURLToPath(
  new URL("../supabase/migrations/20260715100000_program_templates_and_scheduling.sql", import.meta.url)
);
const schemaPath = fileURLToPath(new URL("../supabase/schema.sql", import.meta.url));

async function readSchedulingSql() {
  const [migration, schema] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(schemaPath, "utf8")
  ]);
  return { migration, schema };
}

describe("sequence scheduling SQL contract", () => {
  it("adds compatible schedule policy and per-program workout sequence fields", async () => {
    const { migration, schema } = await readSchedulingSql();

    for (const sql of [migration, schema]) {
      expect(sql).toMatch(/schedule_mode\s+text\s+not null\s+default\s+'fixed_weekdays'/i);
      expect(sql).toMatch(/schedule_mode\s+in\s*\(\s*'fixed_weekdays',\s*'cadence',\s*'flexible'\s*\)/i);
      expect(sql).toMatch(/unique\s*\(\s*program_id\s*,\s*sequence_index\s*\)/i);
    }

    expect(schema).toMatch(/sequence_index\s+integer\s*,/i);
    expect(schema).toMatch(/day_type\s*=\s*'training'\s+and\s+sequence_index\s+is\s+not\s+null.*day_type\s*=\s*'rest'\s+and\s+sequence_index\s+is\s+null/is);
    expect(migration).toMatch(/add column if not exists sequence_index integer/i);
    expect(migration).toMatch(/alter column sequence_index set not null/i);
    expect(migration).toMatch(/row_number\(\)\s+over\s*\(\s*partition by\s+program_id\s+order by\s+scheduled_date\s*,\s*created_at\s*,\s*id\s*\)\s*-\s*1/i);
    expect(migration).toMatch(/create index.*workouts.*program.*sequence/i);
  });

  it("persists named custom templates without excluding historical program types", async () => {
    const [migration, schema] = await Promise.all([
      readFile(templatesMigrationPath, "utf8"),
      readFile(schemaPath, "utf8")
    ]);

    for (const sql of [migration, schema]) {
      expect(sql).toMatch(/custom_template_name\s+text/i);
      expect(sql).toMatch(/schedule_config\s+jsonb\s+not null\s+default\s+'\{\}'::jsonb/i);
      expect(sql).toMatch(/'one_split'.*'three_split'.*'five_split'.*'push_pull_squat'.*'custom'/is);
      expect(sql).toMatch(/'three_day_full_body'.*'four_day_upper_lower'/is);
    }
  });
});
