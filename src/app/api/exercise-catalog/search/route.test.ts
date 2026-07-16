import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, searchWgerExercises } = vi.hoisted(() => ({ getUser: vi.fn(), searchWgerExercises: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser } })
}));

vi.mock("@/lib/wger-client", () => ({
  WgerUnavailableError: class WgerUnavailableError extends Error {},
  searchWgerExercises
}));

import { GET } from "./route";

describe("GET /api/exercise-catalog/search", () => {
  beforeEach(() => {
    getUser.mockReset();
    searchWgerExercises.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  });

  it("rejects an unauthenticated catalog request", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET(new Request("https://app.test/api/exercise-catalog/search?q=bench&page=1"));

    expect(response.status).toBe(401);
  });

  it("accepts only bounded internal search inputs", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    searchWgerExercises.mockResolvedValue({ hasMore: false, items: [] });

    const response = await GET(new Request("https://app.test/api/exercise-catalog/search?q=bench&page=1&url=https://evil.example", {
      headers: { authorization: "Bearer test-token" }
    }));

    expect(response.status).toBe(200);
    expect(searchWgerExercises).toHaveBeenCalledWith({ category: undefined, page: 1, query: "bench" });
    expect(response.headers.get("cache-control")).toBe("private, max-age=60");
  });

  it("allows an empty query to load the first catalog page", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    searchWgerExercises.mockResolvedValue({ hasMore: false, items: [] });

    const response = await GET(new Request("https://app.test/api/exercise-catalog/search?page=1", {
      headers: { authorization: "Bearer test-token" }
    }));

    expect(response.status).toBe(200);
    expect(searchWgerExercises).toHaveBeenCalledWith({ category: undefined, page: 1, query: "" });
  });

  it("returns a stable unavailable error without exposing upstream details", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    searchWgerExercises.mockRejectedValue(new Error("untrusted upstream body"));

    const response = await GET(new Request("https://app.test/api/exercise-catalog/search?q=bench&page=1", {
      headers: { authorization: "Bearer test-token" }
    }));

    await expect(response.json()).resolves.toEqual({ error: "WGER_UNAVAILABLE" });
    expect(response.status).toBe(503);
  });
});
