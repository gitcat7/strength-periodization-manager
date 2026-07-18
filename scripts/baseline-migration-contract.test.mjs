import { readFile, readdir } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const baselinePath = new URL("../supabase/migrations/20260702000000_initial_schema.sql", import.meta.url);
const migrationsPath = new URL("../supabase/migrations/", import.meta.url);

describe("initial database baseline", () => {
  test("creates the core tables required before the first historical migration", async () => {
    const sql = await readFile(baselinePath, "utf8");

    for (const table of [
      "athlete_profiles",
      "exercises",
      "lift_profiles",
      "programs",
      "workouts",
      "workout_exercises",
      "set_logs",
      "recommendations",
      "pr_goals"
    ]) {
      expect(sql).toMatch(new RegExp(`create table if not exists public\\.${table}`, "i"));
    }

    expect(sql).toMatch(/create extension if not exists "pgcrypto"/i);
    expect(sql).toMatch(/alter table public\.athlete_profiles enable row level security/i);
    expect(sql).toMatch(/on conflict \(slug\) do nothing/i);
  });

  test("assigns every migration file a unique Supabase migration version", async () => {
    const names = (await readdir(migrationsPath)).filter((name) => name.endsWith(".sql"));
    const versions = names.map((name) => name.match(/^(\d+)_/)?.[1]);

    expect(versions).not.toContain(undefined);
    expect(new Set(versions).size).toBe(versions.length);
  });
});
