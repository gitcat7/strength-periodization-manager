/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), setSession: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams("next=/history")
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({ auth: { setSession: mocks.setSession } })
}));

import { LocalQaLogin } from "./local-qa-login";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.setSession.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe("LocalQaLogin", () => {
  it("stores the local QA session and redirects to the requested internal page", async () => {
    mocks.setSession.mockResolvedValue({ error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ access_token: "access", refresh_token: "refresh" })));

    await renderLogin();

    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" });
    expect(mocks.replace).toHaveBeenCalledWith("/history");
  });

  it("shows a generic message when the local endpoint is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await renderLogin();

    expect(container?.textContent).toContain("本地 QA 登录不可用");
    expect(container?.textContent).not.toContain("DEV_BROWSER_QA_PASSWORD");
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
});

async function renderLogin() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<LocalQaLogin />);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, status: 200 });
}
