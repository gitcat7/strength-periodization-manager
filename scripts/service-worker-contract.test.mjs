import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const swSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const { default: nextConfig } = await import(new URL("../next.config.mjs", import.meta.url));
const settingsSource = await readFile(
  new URL("../src/components/settings/settings-panel.tsx", import.meta.url),
  "utf8"
);

describe("exercise catalog service-worker contract", () => {
  it("keeps catalog data out of install precache and in a dedicated stable cache", () => {
    const precacheBlock = swSource.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/)?.[1] ?? "";

    expect(precacheBlock).not.toContain("exercise-catalog");
    expect(swSource).toContain('const CACHE_VERSION = "strength-periodization-v5";');
    expect(swSource).toContain('const CATALOG_CACHE = "strength-periodization-catalog-v1";');
    expect(swSource).toMatch(/key !== CATALOG_CACHE/);
  });

  it("routes manifest network-first and commit-addressed data cache-first before static assets", () => {
    const manifestRoute = 'url.pathname === "/exercise-catalog/manifest.json"';
    const dataRoute = 'url.pathname.startsWith("/exercise-catalog/exercises.")';
    const staticRoute = 'url.pathname.startsWith("/_next/static/")';

    expect(swSource).toContain(manifestRoute);
    expect(swSource).toContain("networkFirst(request, CATALOG_CACHE)");
    expect(swSource).toContain(dataRoute);
    expect(swSource).toContain("cacheFirst(request, CATALOG_CACHE)");
    expect(swSource.indexOf(manifestRoute)).toBeLessThan(swSource.indexOf(staticRoute));
    expect(swSource.indexOf(dataRoute)).toBeLessThan(swSource.indexOf(staticRoute));
    expect(swSource).toContain('if (url.pathname.startsWith("/api/")) return;');
  });

  it("awaits cache writes in both runtime strategies", () => {
    const cachePutCalls = swSource.match(/await cache\.put\(request, response\.clone\(\)\);/g) ?? [];
    expect(cachePutCalls).toHaveLength(2);
  });
});

describe("exercise catalog cache headers", () => {
  it("makes the manifest revalidatable and versioned data immutable", async () => {
    const headers = await nextConfig.headers();

    expect(headers).toEqual(
      expect.arrayContaining([
        {
          headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
          source: "/exercise-catalog/manifest.json"
        },
        {
          headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
          source: "/exercise-catalog/exercises.:file.json"
        }
      ])
    );
  });
});

describe("settings cache reset", () => {
  it("clears the verified manifest pointer with browser caches", () => {
    expect(settingsSource).toContain(
      'import { clearExerciseCatalogVerificationState } from "@/lib/exercise-catalog-client";'
    );
    expect(settingsSource).toMatch(/async function clearLocalCache\(\)[\s\S]*?clearExerciseCatalogVerificationState\(\)/);
  });
});
