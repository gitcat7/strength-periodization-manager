import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentPath = fileURLToPath(new URL("./bottom-nav.tsx", import.meta.url));
const globalStylesPath = fileURLToPath(new URL("../../app/globals.css", import.meta.url));

describe("bottom navigation touch feedback", () => {
  it("limits inactive-tab hover backgrounds to hover-capable devices", async () => {
    const [component, styles] = await Promise.all([
      readFile(componentPath, "utf8"),
      readFile(globalStylesPath, "utf8")
    ]);

    expect(component).not.toContain("hover:bg-field");
    expect(component).toContain("bottom-nav-item");
    expect(styles).toMatch(
      /@media \(hover: hover\)[\s\S]*?\.bottom-nav-item:not\(\.bottom-nav-item-active\):hover\s*\{\s*background-color: rgb\(.*?\);/
    );
  });
});
