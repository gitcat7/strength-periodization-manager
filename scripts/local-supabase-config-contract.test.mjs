import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const configPath = new URL("../supabase/config.toml", import.meta.url);

describe("local Supabase configuration", () => {
  test("disables analytics when Docker Desktop does not expose its TCP daemon", async () => {
    const config = await readFile(configPath, "utf8");

    expect(config).toMatch(/\[analytics\]/);
    expect(config).toMatch(/enabled\s*=\s*false/);
  });
});
