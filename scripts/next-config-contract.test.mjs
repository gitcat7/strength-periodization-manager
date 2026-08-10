import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Next build tracing root", () => {
  it("uses a portable config-relative tracing root", () => {
    const config = readFileSync(new URL("../next.config.mjs", import.meta.url), "utf8");
    expect(config).toMatch(/outputFileTracingRoot:\s*__dirname/);
    expect(config).not.toMatch(/[A-Z]:\\/);
  });
});
