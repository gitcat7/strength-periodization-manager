import { readFile, readdir } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const migrationsPath = new URL("../supabase/migrations/", import.meta.url);
const schemaPath = new URL("../supabase/schema.sql", import.meta.url);

const EXPECTED_GOALS = ["strength", "hypertrophy", "hypertrophy_strength", "fat_loss", "body_recomposition"];

function parseCheckValues(checkSource) {
  const match = checkSource.match(/goal\s+in\s*\(([^)]+)\)/is);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((value) => value.trim().replace(/^'|'$/g, ""))
    .filter(Boolean);
}

describe("plan goal hypertrophy_strength support", () => {
  test("schema.sql defines usr_athlete_profiles.goal to allow hypertrophy_strength", async () => {
    const schema = await readFile(schemaPath, "utf8");
    const tableMatch = schema.match(
      /create table if not exists public\.usr_athlete_profiles\s*\([\s\S]*?\n\s*goal text not null check \(goal in \([^)]+\)\)/is
    );
    expect(tableMatch).toBeTruthy();
    const values = parseCheckValues(tableMatch[0]);
    expect(values).toEqual(expect.arrayContaining(EXPECTED_GOALS));
    expect(values).toHaveLength(EXPECTED_GOALS.length);
  });

  test("a migration updates athlete_profiles_goal_check to allow hypertrophy_strength", async () => {
    const names = (await readdir(migrationsPath))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const migrations = await Promise.all(
      names.map((name) => readFile(new URL(name, migrationsPath), "utf8"))
    );

    const constraintUpdates = [];
    for (const migration of migrations) {
      const regex = /alter table public\.(?:usr_)?athlete_profiles\s+drop constraint if exists athlete_profiles_goal_check;[\s\S]*?alter table public\.(?:usr_)?athlete_profiles\s+add constraint athlete_profiles_goal_check\s+check \(goal in \([^)]+\)\)/gis;
      for (const match of migration.matchAll(regex)) {
        constraintUpdates.push(match[0]);
      }
    }

    expect(constraintUpdates.length).toBeGreaterThan(0);
    const latestUpdate = constraintUpdates.at(-1);
    const values = parseCheckValues(latestUpdate);
    expect(values).toEqual(expect.arrayContaining(EXPECTED_GOALS));
    expect(values).toHaveLength(EXPECTED_GOALS.length);
  });
});
