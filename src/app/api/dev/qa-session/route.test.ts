import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInWithPassword } = vi.hoisted(() => ({ signInWithPassword: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: { signInWithPassword } }))
}));

import { POST } from "./route";

describe("POST /api/dev/qa-session", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("DEV_BROWSER_QA_EMAIL", "qa@example.com");
    vi.stubEnv("DEV_BROWSER_QA_PASSWORD", "test-password");
    vi.stubEnv("NODE_ENV", "development");
    signInWithPassword.mockReset();
  });

  it("is not available outside localhost and does not call Supabase", async () => {
    const response = await POST(new Request("https://strength-periodization-manager.vercel.app/api/dev/qa-session", { method: "POST" }));

    expect(response.status).toBe(404);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("does not accept credentials or user identity from the request", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "access-token", refresh_token: "refresh-token" } },
      error: null
    });

    const response = await POST(
      new Request("http://localhost/api/dev/qa-session", {
        body: JSON.stringify({ email: "attacker@example.com", password: "attacker-password", user_id: "attacker-id" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      })
    );

    await expect(response.json()).resolves.toEqual({ access_token: "access-token", refresh_token: "refresh-token" });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "qa@example.com", password: "test-password" });
  });

  it("returns a generic unavailable error without upstream details", async () => {
    signInWithPassword.mockResolvedValue({ data: { session: null }, error: new Error("sensitive upstream diagnostic") });

    const response = await POST(new Request("http://127.0.0.1/api/dev/qa-session", { method: "POST" }));

    await expect(response.json()).resolves.toEqual({ error: "LOCAL_QA_LOGIN_UNAVAILABLE" });
    expect(response.status).toBe(503);
  });
});
