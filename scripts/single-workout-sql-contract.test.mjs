import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const migrationPath = new URL("../supabase/migrations/20260716090000_standalone_workouts.sql", import.meta.url);

describe("standalone workout migration", () => {
  test("permits owned training workouts without a program while retaining RLS ownership", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/alter column program_id drop not null/i);
    expect(sql).toMatch(/workouts\.program_id is null/i);
    expect(sql).toMatch(/auth\.uid\(\) = workouts\.user_id/i);
    expect(sql).toMatch(/workout\.program_id is null/i);
  });
});
