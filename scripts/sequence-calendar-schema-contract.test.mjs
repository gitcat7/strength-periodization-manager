import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../supabase/migrations/20260730100000_sequence_calendar_scheduling.sql", import.meta.url)
);
const schemaPath = fileURLToPath(new URL("../supabase/schema.sql", import.meta.url));
const tableNamesPath = fileURLToPath(new URL("../src/lib/supabase/table-names.ts", import.meta.url));

async function readSql() {
  const [migration, schema] = await Promise.all([readFile(migrationPath, "utf8"), readFile(schemaPath, "utf8")]);
  return { migration, schema };
}

describe("sequence calendar scheduling schema contract", () => {
  it("adds schedule revision, holiday policy, and timezone metadata to programs", async () => {
    const { migration, schema } = await readSql();

    expect(schema).toContain("schedule_revision integer not null default 1");
    expect(schema).toContain("holiday_policy in ('train', 'rest_and_shift')");
    for (const sql of [migration, schema]) {
      expect(sql).toContain("schedule_revision integer not null default 1");
      expect(sql).toContain("holiday_policy in ('train', 'rest_and_shift')");
      expect(sql).toContain("timezone text not null default 'Asia/Shanghai'");
    }
  });

  it("widens session duration choices and relaxes legacy weekly training days", async () => {
    const { migration, schema } = await readSql();

    expect(schema).toContain("session_duration_minutes in (45, 60, 75, 90, 120, 150, 180)");
    expect(migration).toContain("session_duration_minutes in (45, 60, 75, 90, 120, 150, 180)");
    expect(migration).toMatch(/alter column training_days_per_week drop not null/i);
    expect(migration).toMatch(/drop constraint if exists athlete_profiles_session_duration_minutes_check/i);
  });

  it("adds cycle, skip, and replacement metadata to workouts", async () => {
    const { migration, schema } = await readSql();

    for (const sql of [migration, schema]) {
      expect(sql).toMatch(/cycle_index integer/i);
      expect(sql).toMatch(/cycle_position integer/i);
      expect(sql).toMatch(/skip_reason text/i);
      expect(sql).toMatch(/replaced_by_workout_id uuid references public\.plan_workouts\(id\)/i);
    }
  });

  it("creates calendar, unavailable date, and schedule event tables", async () => {
    const { migration, schema } = await readSql();

    expect(schema).toContain("create table if not exists public.usr_unavailable_dates");
    expect(schema).toContain("create table if not exists public.ops_schedule_events");
    for (const sql of [migration, schema]) {
      expect(sql).toContain("create table if not exists public.cfg_cn_calendar_dates");
      expect(sql).toContain("create table if not exists public.usr_unavailable_dates");
      expect(sql).toContain("create table if not exists public.ops_schedule_events");
    }
  });

  it("limits schedule event types to the auditable adjustment list", async () => {
    const { migration, schema } = await readSql();

    for (const sql of [migration, schema]) {
      for (const eventType of [
        "extra_rest",
        "pause_started",
        "resume_confirmed",
        "holiday_override",
        "unavailable_date_added",
        "recovery_strategy_skip",
        "schedule_undone"
      ]) {
        expect(sql).toContain(`'${eventType}'`);
      }
    }
  });

  it("protects user-owned tables with RLS and keeps the calendar read-only for clients", async () => {
    const { migration, schema } = await readSql();

    for (const sql of [migration, schema]) {
      expect(sql).toMatch(/alter table public\.usr_unavailable_dates enable row level security/i);
      expect(sql).toMatch(/alter table public\.ops_schedule_events enable row level security/i);
      expect(sql).toMatch(/alter table public\.cfg_cn_calendar_dates enable row level security/i);
      expect(sql).toMatch(/on public\.usr_unavailable_dates for all[\s\S]*?auth\.uid\(\) = user_id/i);
      expect(sql).toMatch(/on public\.ops_schedule_events for all[\s\S]*?auth\.uid\(\) = user_id/i);
      expect(sql).toMatch(/on public\.cfg_cn_calendar_dates for select/i);
      expect(sql).toMatch(/revoke insert, update, delete on public\.cfg_cn_calendar_dates/i);
    }
  });

  it("seeds statutory China holidays for 2026 and 2027 without make-up workdays", async () => {
    const { migration, schema } = await readSql();

    for (const sql of [migration, schema]) {
      for (const date of ["2026-02-17", "2026-06-19", "2026-09-25", "2027-02-06", "2027-06-09", "2027-09-15"]) {
        expect(sql).toContain(`'${date}'`);
      }
      expect(sql).not.toMatch(/补班|调休工作日/);
    }
  });

  it("maps the new physical tables in DB_TABLE", async () => {
    const tableNames = await readFile(tableNamesPath, "utf8");

    expect(tableNames).toContain('calendarDates: "cfg_cn_calendar_dates"');
    expect(tableNames).toContain('unavailableDates: "usr_unavailable_dates"');
    expect(tableNames).toContain('scheduleEvents: "ops_schedule_events"');
  });
});
