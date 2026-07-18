import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ headers: vi.fn(), notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }) }));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/components/auth/local-qa-login", () => ({ LocalQaLogin: () => null }));

import QaLoginPage from "./page";

describe("QaLoginPage", () => {
  it("does not expose the local QA page outside development localhost", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.headers.mockResolvedValue({ get: () => "strength-periodization-manager.vercel.app" });

    await expect(QaLoginPage()).rejects.toThrow("NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });
});
