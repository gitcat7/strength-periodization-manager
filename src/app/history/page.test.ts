import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pagePath = fileURLToPath(new URL("./page.tsx", import.meta.url));

describe("history page search-param boundary", () => {
  it("wraps the client history calendar in Suspense for focused workout URLs", async () => {
    const page = await readFile(pagePath, "utf8");

    expect(page).toContain('import { Suspense } from "react"');
    expect(page).toContain("<Suspense");
    expect(page).toContain("</Suspense>");
  });
});
