import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../supabase/migrations/20260730100000_sequence_calendar_scheduling.sql", import.meta.url)
);
const schemaPath = fileURLToPath(new URL("../supabase/schema.sql", import.meta.url));
const tableNamesPath = fileURLToPath(new URL("../src/lib/supabase/table-names.ts", import.meta.url));
const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
const planPath = fileURLToPath(new URL("../docs/superpowers/plans/2026-07-30-sequence-calendar-scheduling-phase-1.md", import.meta.url));
const smokePath = fileURLToPath(new URL("./sequence-calendar-smoke.test.mjs", import.meta.url));
const pgTapPath = fileURLToPath(new URL("../supabase/tests/sequence_calendar_scheduling.test.sql", import.meta.url));
const reflowFixMigrationPath = fileURLToPath(
  new URL("../supabase/migrations/20260809010000_defer_reflow_schedule_index_constraint.sql", import.meta.url)
);

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

  it("uses the public replacement payload exercises field in both baselines", async () => {
    const { migration, schema } = await readSql();

    for (const sql of [migration, schema]) {
      expect(sql).toMatch(/jsonb_typeof\(v_item -> 'exercises'\) <> 'array'/i);
      expect(sql).toMatch(/jsonb_array_elements\(v_item -> 'exercises'\)/i);
      expect(sql).not.toMatch(/v_item -> 'cfg_exercises'/i);
    }
  });

  it("exposes a repeatable dedicated pgTAP command for this migration", async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    expect(packageJson.scripts["test:db:sequence"]).toBe(
      "pnpm dlx supabase@2.34.3 test db supabase/tests/sequence_calendar_scheduling.test.sql --local"
    );
  });

  it("keeps the phase-one plan free of the obsolete --file database command", async () => {
    const plan = await readFile(planPath, "utf8");
    expect(plan).not.toContain("pnpm test:db -- --file");
    expect(plan).toContain("pnpm test:db:sequence");
  });

  it("calls single-jsonb scheduling RPCs with their named p_payload argument", async () => {
    const smoke = await readFile(smokePath, "utf8");
    expect(smoke).toMatch(/body:\s*JSON\.stringify\(\{\s*p_payload:\s*payload\s*\}\)/);
  });

  it("reflows swapped schedule indexes with a transaction-deferred uniqueness check", async () => {
    const { schema } = await readSql();
    const pgTap = await readFile(pgTapPath, "utf8");
    expect(existsSync(reflowFixMigrationPath)).toBe(true);
    const reflowFixMigration = await readFile(reflowFixMigrationPath, "utf8");

    for (const sql of [schema, reflowFixMigration]) {
      expect(sql).toMatch(/unique\s*\(\s*program_id\s*,\s*schedule_index\s*\)\s*deferrable\s+initially\s+deferred/i);
    }
    expect(pgTap).toContain('"workout_id": "00000000-0000-0000-0000-000000002405", "scheduled_date": "2026-08-22", "schedule_index": 3');
    expect(pgTap).toContain("swapped schedule indexes remain unique after reflow");
  });

  it("keeps the sequence pgTAP auth fixture independent of Supabase confirmation timestamp columns", async () => {
    const pgTap = await readFile(pgTapPath, "utf8");
    expect(pgTap).not.toContain("email_confirmed_at");
    expect(pgTap).not.toContain("confirmed_at");
  });

  it("keeps the sequence pgTAP plan count aligned with its assertions", async () => {
    const pgTap = await readFile(pgTapPath, "utf8");
    const planned = Number(pgTap.match(/select plan\((\d+)\);/)?.[1]);
    const assertions = (pgTap.match(/^select (?:has_function|is\(|throws_ok\()/gm) ?? []).length;
    expect(planned).toBe(assertions);
  });
});
