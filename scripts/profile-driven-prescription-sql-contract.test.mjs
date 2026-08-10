import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../supabase/migrations/20260726200000_profile_driven_goal_prescriptions.sql", import.meta.url);
const schemaPath = new URL("../supabase/schema.sql", import.meta.url);
const fields = [
  "current_body_weight_kg",
  "target_weight_change_kg_per_week",
  "weight_change_last_14_days_kg",
  "nutrition_adherence",
  "protein_target_met",
  "recovery_status"
];

describe("profile-driven prescription schema", () => {
  it("persists every input that changes goal-specific training volume", async () => {
    const [migration, schema] = await Promise.all([
      readFile(migrationPath, "utf8"),
      readFile(schemaPath, "utf8")
    ]);

    for (const field of fields) {
      expect(migration).toMatch(new RegExp(`add column if not exists ${field}`, "i"));
      expect(schema).toMatch(new RegExp(`\\b${field}\\b`, "i"));
    }
  });
});
