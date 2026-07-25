import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const migrationPath = new URL("../supabase/migrations/20260725120000_database_schema_organization.sql", import.meta.url);
const schemaPath = new URL("../supabase/schema.sql", import.meta.url);

const renamedTables = {
  athlete_profiles: "usr_athlete_profiles",
  exercises: "cfg_exercises",
  lift_profiles: "usr_lift_profiles",
  programs: "plan_programs",
  workouts: "plan_workouts",
  workout_exercises: "plan_workout_exercises",
  set_logs: "log_set_logs",
  recommendations: "log_recommendations",
  pr_goals: "log_pr_goals",
  feedback_reports: "ops_feedback_reports",
  analytics_events: "ops_analytics_events",
  agent_access_tokens: "ops_agent_access_tokens"
};

describe("database schema organization", () => {
  test("defines prefixed physical tables and read-only legacy views", async () => {
    const migration = await readFile(migrationPath, "utf8");

    for (const [legacyName, table] of Object.entries(renamedTables)) {
      expect(migration).toMatch(new RegExp(`\\('${legacyName}', '${table}'\\)`, "i"));
      expect(migration).toMatch(new RegExp(`comment on table public\\.${table}`, "i"));
      expect(migration).toMatch(new RegExp(`create or replace view public\\.${legacyName}\\s+with \\(security_invoker = true\\)`, "i"));
      expect(migration).toMatch(new RegExp(`revoke insert, update, delete on[\\s\\S]*public\\.${legacyName}`, "i"));
    }
  });

  test("documents calendar days separately from timestamped events", async () => {
    const [migration, schema] = await Promise.all([readFile(migrationPath, "utf8"), readFile(schemaPath, "utf8")]);

    for (const column of ["start_date", "end_date", "scheduled_date", "target_date"]) {
      expect(schema).toMatch(new RegExp(`${column} date`, "i"));
    }

    for (const column of ["created_at", "updated_at", "completed_at", "last_used_at", "expires_at", "revoked_at"]) {
      expect(schema).toMatch(new RegExp(`${column} timestamptz`, "i"));
    }

    expect(migration).toMatch(/comment on column public\.plan_workouts\.scheduled_date/i);
  });

  test("adds indexes and a single updated-at trigger function", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toMatch(/create or replace function public\.set_updated_at\(\)/i);
    expect(migration).toMatch(/create index if not exists plan_workouts_user_status_scheduled_idx/i);
    expect(migration).toMatch(/create unique index if not exists plan_workout_exercises_workout_order_key/i);
    expect(migration).toMatch(/create index if not exists log_recommendations_user_status_created_idx/i);
  });

  test("only creates updated-at triggers for tables that actually have that column", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toMatch(/information_schema\.columns/i);
    expect(migration).toMatch(/column_name\s*=\s*'updated_at'/i);
  });
});
