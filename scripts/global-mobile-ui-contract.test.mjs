import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesPath = fileURLToPath(new URL("../src/app/globals.css", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/components/navigation/bottom-nav.tsx", import.meta.url));

describe("global mobile UI contract", () => {
  it("preserves safe areas, visible focus, reduced motion, and inherited control fonts", async () => {
    const styles = await readFile(stylesPath, "utf8");

    expect(styles).toMatch(/body\s*\{[\s\S]*?env\(safe-area-inset-bottom\)/);
    expect(styles).toMatch(/\.app-shell\s*\{[\s\S]*?env\(safe-area-inset-bottom\)/);
    expect(styles).toMatch(/:focus-visible\s*\{[\s\S]*?outline:\s*2px solid/);
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toMatch(/button,\s*a,\s*input,\s*select,\s*textarea\s*\{[\s\S]*?font:\s*inherit/);
    expect(styles).not.toMatch(/outline\s*:\s*(?:0|none)\s*;/);
  });

  it("uses tabular numeric figures and removes tap flash without suppressing focus", async () => {
    const styles = await readFile(stylesPath, "utf8");

    expect(styles).toMatch(/input\[type="number"\],[\s\S]*?\.tabular-nums\s*\{[\s\S]*?font-variant-numeric:\s*tabular-nums/);
    expect(styles).toMatch(/button,\s*a,\s*input,\s*select,\s*textarea\s*\{[\s\S]*?-webkit-tap-highlight-color:\s*transparent/);
  });

  it("keeps bottom navigation labeled, safe-area-aware, and touch sized", async () => {
    const navigation = await readFile(navigationPath, "utf8");

    expect(navigation).toContain('aria-label="主导航"');
    expect(navigation).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(navigation).toContain("min-h-12");
  });
});
