import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const managerPath = new URL("./program-manager.tsx", import.meta.url);

describe("recommendation application", () => {
  test("loads a server-side impact preview before applying a pending recommendation", async () => {
    const source = await readFile(managerPath, "utf8");
    expect(source).toContain('rpc("preview_recommendation_application"');
    expect(source).toContain('rpc("apply_recommendation"');
    expect(source).toContain("受影响的后续训练日");
  });
});
