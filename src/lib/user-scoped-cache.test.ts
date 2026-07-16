import { describe, expect, it } from "vitest";
import { getUserScopedCache } from "./user-scoped-cache";

describe("getUserScopedCache", () => {
  it("rejects a cache saved for another user", () => {
    expect(getUserScopedCache({ userId: "previous-user", value: "old" }, "current-user")).toBeNull();
  });

  it("returns the cache when it belongs to the authenticated user", () => {
    const cache = { userId: "current-user", value: "current" };
    expect(getUserScopedCache(cache, "current-user")).toBe(cache);
  });
});
