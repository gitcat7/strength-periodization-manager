import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../supabase/migrations/20260715090000_sequence_scheduling_foundation.sql", import.meta.url)
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

    expect(schema).toMatch(/sequence_index\s+integer\s+not null/i);
    expect(migration).toMatch(/add column if not exists sequence_index integer/i);
    expect(migration).toMatch(/alter column sequence_index set not null/i);
    expect(migration).toMatch(/row_number\(\)\s+over\s*\(\s*partition by\s+program_id\s+order by\s+scheduled_date\s*,\s*created_at\s*,\s*id\s*\)\s*-\s*1/i);
    expect(migration).toMatch(/create index.*workouts.*program.*sequence/i);
  });
});
