import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const migrationPath = resolve(root, 'supabase/migrations/20260810110000_revise_workout_prescription.sql');
const schemaPath = resolve(root, 'supabase/schema.sql');
const pgTapPath = resolve(root, 'supabase/tests/revise_workout_prescription.test.sql');

function read(path) {
  return readFileSync(path, 'utf8').toLowerCase();
}

describe('workout prescription revision SQL contract', () => {
  it('ships the migration, schema baseline, and pgTAP fixture', () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(schemaPath)).toBe(true);
    expect(existsSync(pgTapPath)).toBe(true);
  });

  for (const [label, path] of [['migration', migrationPath], ['schema', schemaPath]]) {
    it(`${label} defines revision and audit storage`, () => {
      const sql = read(path);
      expect(sql).toMatch(/plan_workouts[\s\S]{0,3000}prescription_revision/);
      expect(sql).toContain('ops_workout_revision_events');
      expect(sql).toMatch(/ops_workout_revision_events[\s\S]{0,160}enable row level security/);
      expect(sql).toMatch(/revoke all on table public\.ops_workout_revision_events from public, anon, authenticated/);
    });

    it(`${label} exposes only the authenticated atomic RPC`, () => {
      const sql = read(path);
      expect(sql).toMatch(/create or replace function public\.revise_workout_prescription\(\s*p_workout_id uuid,\s*p_expected_revision integer,\s*p_payload jsonb/);
      expect(sql).toMatch(/returns jsonb[\s\S]{0,300}security definer[\s\S]{0,300}set search_path = public/);
      expect(sql).toContain('auth.uid()');
      expect(sql).toMatch(/revoke all on function public\.revise_workout_prescription\(uuid, integer, jsonb\) from public, anon/);
      expect(sql).toMatch(/grant execute on function public\.revise_workout_prescription\(uuid, integer, jsonb\) to authenticated/);
    });

    it(`${label} validates ownership, pending state, revision, and local exercise payload`, () => {
      const sql = read(path);
      expect(sql).toContain("status not in ('scheduled', 'draft')");
      expect(sql).toContain('prescription_revision');
      expect(sql).toContain("jsonb_typeof(p_payload -> 'exercises')");
      expect(sql).toContain('jsonb_array_elements');
      expect(sql).toContain('cfg_exercises');
      expect(sql).toContain('training_direction');
      expect(sql).toContain('completed');
      expect(sql).toMatch(/only local cfg_exercises|local cfg_exercises can be used/);
      expect(sql).toMatch(/direction|incompatible/);
    });
  }

  it('pgTAP exercises success, rejection, and rollback paths', () => {
    const sql = read(pgTapPath);
    expect(sql).toMatch(/select plan\(\d+\)/);
    expect(sql).toContain('throws_ok');
    expect(sql).toContain('revise_workout_prescription');
    expect(sql).toContain('prescription_revision');
    expect(sql).toContain('ops_workout_revision_events');
    expect(sql).toContain('rollback');
  });
});
