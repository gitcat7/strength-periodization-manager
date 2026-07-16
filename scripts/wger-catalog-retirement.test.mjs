import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return /\.(?:ts|tsx|js|mjs)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

describe("wger catalog retirement", () => {
  it("has no production import of the removed static catalog loader", async () => {
    const files = await collectSourceFiles(join(process.cwd(), "src"));
    const source = await Promise.all(files.map((file) => readFile(file, "utf8")));
    expect(source.join("\n")).not.toContain("loadExerciseCatalog");
    expect(source.join("\n")).not.toContain("loadExerciseCatalogRecord");
    expect(source.join("\n")).not.toContain("hasaneyldrm");
  });
});
