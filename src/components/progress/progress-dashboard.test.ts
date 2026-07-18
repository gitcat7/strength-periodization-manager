import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentPath = fileURLToPath(new URL("./progress-dashboard.tsx", import.meta.url));

describe("progress navigation", () => {
  it("keeps a PR entry after PR leaves the primary bottom navigation", async () => {
    const component = await readFile(componentPath, "utf8");

    expect(component).toContain('href="/pr"');
    expect(component).toContain("查看 PR 目标");
  });
});
