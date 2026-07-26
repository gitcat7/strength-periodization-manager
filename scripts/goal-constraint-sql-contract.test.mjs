import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../supabase/migrations/20260726100000_allow_hypertrophy_strength_goal.sql", import.meta.url)
);
const schemaPath = fileURLToPath(new URL("../supabase/schema.sql", import.meta.url));

const goalConstraint = /goal\s+in\s*\(\s*'strength'\s*,\s*'hypertrophy'\s*,\s*'hypertrophy_strength'\s*,\s*'fat_loss'\s*,\s*'body_recomposition'\s*\)/i;

describe("athlete profile goal constraint", () => {
  it("allows every goal offered by the plan setup, including hypertrophy_strength", async () => {
    const [migration, schema] = await Promise.all([
      readFile(migrationPath, "utf8"),
      readFile(schemaPath, "utf8")
    ]);

    expect(migration).toMatch(/alter table public\.usr_athlete_profiles/i);
    expect(migration).toMatch(/drop constraint if exists athlete_profiles_goal_check/i);
    expect(migration).toMatch(goalConstraint);
    expect(schema).toMatch(goalConstraint);
  });
});
