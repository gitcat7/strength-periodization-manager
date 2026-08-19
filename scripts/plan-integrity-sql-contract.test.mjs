import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../supabase/migrations/20260819173000_plan_schedule_and_coach_integrity.sql", import.meta.url)
);
const schemaPath = fileURLToPath(new URL("../supabase/schema.sql", import.meta.url));
const pgTapPath = fileURLToPath(new URL("../supabase/tests/plan_schedule_and_coach_integrity.test.sql", import.meta.url));

async function readOptional(path) {
  return readFile(path, "utf8").catch(() => "");
}

describe("plan schedule and Coach integrity SQL contract", () => {
  it("repairs active schedule ordering without rewriting workout facts", async () => {
    const migration = await readOptional(migrationPath);
    const repairSection = migration.split("-- Enforce schedule chronology after the one-time repair.")[0];

    expect(repairSection).toMatch(/row_number\(\)\s+over\s*\(\s*partition by w\.program_id\s+order by w\.scheduled_date,\s*w\.schedule_index,\s*w\.id\s*\)\s*-\s*1/i);
    expect(repairSection).toMatch(/update public\.plan_workouts[\s\S]*set schedule_index = ordered\.correct_schedule_index/i);
    expect(repairSection).not.toMatch(/set\s+scheduled_date\s*=/i);
    expect(repairSection).not.toMatch(/set\s+status\s*=/i);
    expect(repairSection).not.toMatch(/set\s+sequence_index\s*=/i);
  });

  it("enforces non-decreasing dates by schedule index in every write path", async () => {
    const [migration, schema] = await Promise.all([readOptional(migrationPath), readOptional(schemaPath)]);

    for (const sql of [migration, schema]) {
      expect(sql).toMatch(/create or replace function public\.ensure_schedule_dates_follow_index\(\)/i);
      expect(sql).toMatch(/lag\(scheduled_date\)\s+over\s*\(\s*order by schedule_index\s*\)/i);
      expect(sql).toMatch(/create constraint trigger workouts_require_schedule_date_order[\s\S]*deferrable initially deferred/i);
      expect(sql).toContain("Workout scheduled dates must follow schedule_index");
      expect(sql).toMatch(/create or replace function public\.reflow_program_schedule\(p_payload jsonb\)[\s\S]*Workout scheduled dates must follow schedule_index/i);
    }
  });

  it("serializes and deduplicates one pending Coach suggestion per source workout action", async () => {
    const [migration, schema] = await Promise.all([readOptional(migrationPath), readOptional(schemaPath)]);

    expect(migration).toMatch(/row_number\(\)\s+over\s*\([\s\S]*partition by user_id, workout_id, exercise_id/i);
    for (const sql of [migration, schema]) {
      expect(sql).toMatch(/create unique index if not exists log_recommendations_one_pending_per_workout_exercise_idx[\s\S]*where status = 'pending' and workout_id is not null/i);
      expect(sql).toMatch(/create or replace function public\.replace_pending_workout_recommendations\(p_user_id uuid, p_workout_id uuid\)[\s\S]*for update/i);
      expect(sql).toMatch(/group by we\.exercise_id, ce\.default_increment, ce\.is_main_lift/i);
      expect(sql).not.toMatch(/group by we\.exercise_id, we\.target_weight/i);
      expect(sql).toMatch(/on conflict \(user_id, workout_id, exercise_id\)\s+where status = 'pending' and workout_id is not null[\s\S]*do update/i);
    }
  });

  it("ships a pgTAP regression suite for both invariants", async () => {
    const pgTap = await readOptional(pgTapPath);

    expect(pgTap).toContain("active schedule repair keeps dates non-decreasing by index");
    expect(pgTap).toContain("completed workout facts remain unchanged by schedule repair");
    expect(pgTap).toContain("duplicate pending Coach suggestions are collapsed");
    expect(pgTap).toContain("repeated Coach generation stays idempotent");
    expect(pgTap).toContain("out-of-order schedule writes are rejected");
  });
});
