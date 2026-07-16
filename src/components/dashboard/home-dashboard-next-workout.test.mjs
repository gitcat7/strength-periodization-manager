import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const sourcePath = new URL("./home-dashboard.tsx", import.meta.url);

describe("home dashboard next workout source contract", () => {
  test("does not restore an unchecked next-workout cache entry before loading the active program", async () => {
    const source = await readFile(sourcePath, "utf8");
    expect(source).toMatch(/setNextWorkout\(null\);/);
    expect(source).not.toMatch(/cachedNextWorkout/);
  });

  test("keeps planned training and free training as distinct one-click actions", async () => {
    const source = await readFile(sourcePath, "utf8");
    expect(source).toContain('href="/plan"');
    expect(source).toContain('href="/single-workout"');
    expect(source).toContain("继续今日计划");
    expect(source).toContain("快速记录自由训练");
    expect(source).toContain("创建周期计划");
    expect(source).not.toContain("训练画像");
  });
});
