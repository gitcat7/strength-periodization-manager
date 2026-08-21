import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const editorPath = new URL("./workout-prescription-guardrail-editor.tsx", import.meta.url);

describe("WorkoutPrescriptionGuardrailEditor", () => {
  test("uses structured guardrails and requires a server preview before warning confirmation", async () => {
    const source = await readFile(editorPath, "utf8");
    expect(source).toContain("assessWorkoutPrescription");
    expect(source).toContain('rpc("preview_workout_prescription_revision"');
    expect(source).toContain('rpc("revise_workout_prescription"');
    expect(source).toContain("二次确认保存");
    expect(source).toContain("warningMessages");
  });
});
