/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  signOut: vi.fn(),
  tokenUpdateError: null as { message: string } | null,
  tokenUpdates: [] as Array<Record<string, unknown>>
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => createSupabaseMock()
}));

import { SettingsPanel } from "./settings-panel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

beforeEach(() => {
  testState.signOut.mockReset().mockResolvedValue({ error: { message: "test navigation stop" } });
  testState.tokenUpdateError = null;
  testState.tokenUpdates.length = 0;
  window.localStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe("SettingsPanel", () => {
  it("orders ordinary settings before collapsed advanced controls", async () => {
    const view = await renderSettings();
    const headings = [...view.querySelectorAll("[data-settings-group]")]
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["账号", "训练偏好", "数据管理", "高级功能"]);
    expect(view.textContent).not.toContain("Agent 中文操作授权");
    expect(view.textContent).not.toContain("训练 Agent");
    expect(view.querySelector('a[href="/diagnostics"]')).toBeNull();
    expect(view.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(view.querySelector('a[href="/feedback"]')).not.toBeNull();

    act(() => findButton(view, "高级功能").click());
    expect(view.textContent).toContain("Agent 中文操作授权");
    expect(view.textContent).toContain("训练 Agent");
    expect(view.querySelector('a[href="/diagnostics"]')).not.toBeNull();
  });

  it("cancels sign-out without side effects and confirms it once", async () => {
    const view = await renderSettings();
    act(() => findButton(view, "退出登录").click());
    expect(view.textContent).toContain("退出登录？");

    act(() => findButton(view, "取消").click());
    expect(testState.signOut).not.toHaveBeenCalled();

    act(() => findButton(view, "退出登录").click());
    await act(async () => {
      findButton(view, "确认退出").click();
      await Promise.resolve();
    });
    expect(testState.signOut).toHaveBeenCalledOnce();
  });

  it("cancels token revocation and confirms the existing revoked_at update once", async () => {
    const view = await renderSettings();
    act(() => findButton(view, "高级功能").click());
    const revoke = view.querySelector<HTMLButtonElement>("[aria-label='撤销 Agent 令牌']");
    expect(revoke).not.toBeNull();

    act(() => revoke?.click());
    expect(view.textContent).toContain("撤销“训练 Agent”令牌？");
    act(() => findButton(view, "取消").click());
    expect(testState.tokenUpdates).toHaveLength(0);

    act(() => revoke?.click());
    await act(async () => {
      findButton(view, "确认撤销").click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(testState.tokenUpdates).toHaveLength(1);
    expect(testState.tokenUpdates[0]).toHaveProperty("revoked_at");
  });

  it("keeps a failed sign-out confirmation open and retryable with a task-oriented error", async () => {
    testState.signOut
      .mockResolvedValueOnce({ error: { message: "Load failed" } })
      .mockResolvedValueOnce({ error: { message: "仍无法退出" } });
    const view = await renderSettings();
    act(() => findButton(view, "退出登录").click());
    await act(async () => {
      findButton(view, "确认退出").click();
      await Promise.resolve();
    });

    expect(view.textContent).toContain("退出失败：Load failed");
    expect(view.textContent).toContain("退出登录？");
    expect(findButton(view, "确认退出").disabled).toBe(false);

    await act(async () => {
      findButton(view, "确认退出").click();
      await Promise.resolve();
    });
    expect(testState.signOut).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed token revocation open and retryable", async () => {
    testState.tokenUpdateError = { message: "Load failed" };
    const view = await renderSettings();
    act(() => findButton(view, "高级功能").click());
    act(() => view.querySelector<HTMLButtonElement>("[aria-label='撤销 Agent 令牌']")?.click());
    await act(async () => {
      findButton(view, "确认撤销").click();
      await Promise.resolve();
    });

    expect(view.textContent).toContain("令牌撤销失败：Load failed");
    expect(view.textContent).toContain("撤销“训练 Agent”令牌？");
    expect(findButton(view, "确认撤销").disabled).toBe(false);
  });
});

async function renderSettings() {
  const view = document.createElement("div");
  root = createRoot(view);
  await act(async () => {
    root?.render(<SettingsPanel />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return view;
}

function findButton(view: HTMLElement, label: string) {
  const button = [...view.querySelectorAll("button")]
    .find((candidate) => candidate.textContent?.includes(label));
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

function createSupabaseMock() {
  return {
    auth: {
      getSession: () => Promise.resolve({
        data: { session: { user: { email: "long-athlete@example.com", id: "user-1" } } },
        error: null
      }),
      signOut: testState.signOut
    },
    from: () => {
      let updatePayload: Record<string, unknown> | null = null;
      const builder = {
        eq() {
          return builder;
        },
        insert() {
          return Promise.resolve({ error: null });
        },
        order() {
          return Promise.resolve({
            data: [{
              created_at: "2026-07-01T00:00:00.000Z",
              expires_at: "2027-01-01T00:00:00.000Z",
              id: "token-1",
              last_used_at: null,
              name: "训练 Agent",
              revoked_at: null
            }],
            error: null
          });
        },
        select() {
          return builder;
        },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          if (updatePayload) testState.tokenUpdates.push(updatePayload);
          return Promise.resolve({
            data: null,
            error: updatePayload ? testState.tokenUpdateError : null
          }).then(resolve, reject);
        },
        update(payload: Record<string, unknown>) {
          updatePayload = payload;
          return builder;
        }
      };
      return builder;
    }
  };
}
