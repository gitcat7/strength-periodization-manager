import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, getWgerExercise } = vi.hoisted(() => ({ getUser: vi.fn(), getWgerExercise: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser } })
}));

vi.mock("@/lib/wger-client", () => ({ getWgerExercise }));

import { GET } from "./route";

describe("GET /api/exercise-catalog/[externalId]", () => {
  beforeEach(() => {
    getUser.mockReset();
    getWgerExercise.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  });

  it("rejects malformed external ids before calling the upstream adapter", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    const response = await GET(new Request("https://app.test/api/exercise-catalog/invalid"), {
      params: Promise.resolve({ externalId: "invalid" })
    });

    expect(response.status).toBe(400);
    expect(getWgerExercise).not.toHaveBeenCalled();
  });
});
