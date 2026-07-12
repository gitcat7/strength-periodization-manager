import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../supabase/migrations/20260711190000_exercise_catalog_bridge.sql", import.meta.url)
);
const schemaPath = fileURLToPath(new URL("../supabase/schema.sql", import.meta.url));

async function readBridgeFiles() {
  const [migration, schema] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(schemaPath, "utf8")
  ]);

  return { migration, schema };
}

function compactSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

describe("exercise catalog bridge SQL contract", () => {
  it("adds the reviewed bridge fields and keeps the final schema synchronized", async () => {
    const { migration, schema } = await readBridgeFiles();

    for (const sql of [migration, schema]) {
      expect(sql).toMatch(/catalog_external_id\s+text/i);
      expect(sql).toMatch(/catalog_external_id\s+text\s+unique|unique\s*\(catalog_external_id\)/i);
      expect(sql).toMatch(/training_direction\s+text/i);
      expect(sql).toMatch(/movement_pattern\s+text/i);
      expect(sql).toMatch(/substitution_enabled\s+boolean\s+not null\s+default false/i);
      expect(sql).toMatch(/workout_exercises[\s\S]*updated_at\s+timestamptz\s+not null\s+default now\(\)/i);
    }
  });

  it("contains exactly the reviewed 29-row catalog mapping", async () => {
    const { migration, schema } = await readBridgeFiles();
    const reviewedMappings = [
      ["bench_press", "0025", "push", "horizontal_press", false],
      ["overhead_press", "0091", "push", "vertical_press", true],
      ["incline_dumbbell_press", "0314", "push", "horizontal_press", true],
      ["lateral_raise", "0334", "push", "shoulder_abduction", true],
      ["triceps_pushdown", "0201", "push", "elbow_extension", true],
      ["barbell_row", "0027", "pull", "horizontal_pull", false],
      ["lat_pulldown", "2330", "pull", "vertical_pull", true],
      ["seated_cable_row", "0861", "pull", "horizontal_pull", true],
      ["face_pull", "0233", "pull", "rear_delt", true],
      ["dumbbell_curl", "0294", "pull", "elbow_flexion", true],
      ["back_squat", "0043", "squat", "knee_dominant", false],
      ["romanian_deadlift", "0085", "squat", "hip_hinge", true],
      ["leg_press", "0739", "squat", "knee_dominant", true],
      ["leg_curl", "0599", "squat", "knee_flexion", true],
      ["standing_calf_raise", "0605", "squat", "calf_raise", true],
      ["pull_up", "0652", "pull", "vertical_pull", true],
      ["deadlift", "0032", "pull", "hip_hinge", false],
      ["machine_chest_press", "0577", "push", "horizontal_press", true],
      ["machine_shoulder_press", "0603", "push", "vertical_press", true],
      ["cable_lateral_raise", "0178", "push", "shoulder_abduction", true],
      ["rope_triceps_pushdown", "0200", "push", "elbow_extension", true],
      ["machine_seated_row", "1350", "pull", "horizontal_pull", true],
      ["neutral_grip_lat_pulldown", "0818", "pull", "vertical_pull", true],
      ["cable_reverse_fly", "0225", "pull", "rear_delt", true],
      ["cable_biceps_curl", "0868", "pull", "elbow_flexion", true],
      ["machine_hack_squat", "0743", "squat", "knee_dominant", true],
      ["dumbbell_romanian_deadlift", "1459", "squat", "hip_hinge", true],
      ["lying_leg_curl", "0586", "squat", "knee_flexion", true],
      ["cable_standing_calf_raise", "1375", "squat", "calf_raise", true]
    ];
    const catalogIds = reviewedMappings.map(([, catalogId]) => catalogId);

    for (const sql of [migration, schema]) {
      for (const [slug, catalogId, direction, pattern, enabled] of reviewedMappings) {
        expect(sql).toMatch(
          new RegExp(
            `\\('${slug}'[\\s\\S]{0,180}'${catalogId}',\\s*'${direction}',\\s*'${pattern}',\\s*${enabled}\\)`,
            "i"
          )
        );
      }
      expect([...new Set((sql.match(/'\d{4}'/g) ?? []).map((id) => id.slice(1, -1)))].sort()).toEqual(
        [...catalogIds].sort()
      );
      expect(sql).toMatch(/\('cardio_zone2',[\s\S]*null,[\s\S]*'cardio',[\s\S]*'aerobic_base',[\s\S]*false\)/i);
    }
    expect(migration).toMatch(/insert into public\.exercises[\s\S]*machine_chest_press/i);
    expect(migration).not.toMatch(/insert into public\.exercises\s*\(\s*id/i);
  });

  it("defines a locked, ownership-checked, authenticated-only RPC with no user parameter", async () => {
    const { migration, schema } = await readBridgeFiles();

    for (const sql of [migration, schema]) {
      const compact = compactSql(sql);
      expect(compact).toMatch(/create (or replace )?function public\.substitute_workout_exercise\(\s*p_workout_exercise_id uuid, p_target_exercise_id uuid, p_scope workout_exercise_substitution_scope\s*\)/i);
      expect(compact).not.toMatch(/substitute_workout_exercise\([^)]*user_id/i);
      expect(compact).toMatch(/security definer set search_path = public/i);
      expect(compact).toMatch(/v_user_id uuid := auth\.uid\(\)/i);
      expect(compact).toMatch(/v_user_id is null/i);
      expect(compact).toMatch(/programs(?: as)? p on p\.id = w\.program_id/i);
      expect(compact).toMatch(/p\.user_id = v_user_id/i);
      expect(compact).toMatch(/p\.status = 'active'/i);
      expect(compact).toMatch(/w\.status in \('scheduled', 'draft'\)/i);
      expect(compact).toMatch(/we\.order_index >= 3/i);
      expect(compact).toMatch(/e\.training_direction is not null/i);
      expect(compact).toMatch(/e\.movement_pattern is not null/i);
      expect(compact).toMatch(/for update/i);
      expect(compact).toMatch(/sl\.completed/i);
      expect(compact).toMatch(/delete from public\.set_logs/i);
      expect(compact).toMatch(/not sl\.completed/i);
      expect(compact).toMatch(/target_weight = 0/i);
      expect(compact).toMatch(/updated_at = now\(\)/i);
      expect(compact).toMatch(/revoke execute on function public\.substitute_workout_exercise\(\s*uuid, uuid, workout_exercise_substitution_scope\s*\) from public, anon/i);
      expect(compact).toMatch(/grant execute on function public\.substitute_workout_exercise\(\s*uuid, uuid, workout_exercise_substitution_scope\s*\) to authenticated/i);
    }
  });
});
