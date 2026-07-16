import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const sourcePath = new URL("./home-dashboard.tsx", import.meta.url);

describe("home dashboard next workout source contract", () => {
  test("does not restore an unchecked next-workout cache entry before loading the active program", async () => {
    const source = await readFile(sourcePath, "utf8");
    expect(source).toMatch(/setNextWorkout\(null\);/);
    expect(source).not.toMatch(/cachedNextWorkout/);
  });
});
