/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: "test" } } }) },
    rpc: async () => ({ data: null, error: null })
  })
}));

import { SingleWorkoutRecorder } from "./single-workout-recorder";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe("SingleWorkoutRecorder", () => {
  it("starts with audited actions and an explicit free-training boundary", async () => {
    vi.stubGlobal("fetch", vi.fn());
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root?.render(<SingleWorkoutRecorder />));

    expect(container.textContent).toContain("自由训练");
    expect(container.textContent).toContain("本次记录会保存到历史与进展，不会自动调整你的周期计划。");
    expect(container.textContent).toContain("杠铃卧推");
    const addBench = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("添加"));
    expect(addBench).toBeTruthy();
    await act(async () => addBench?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("重量 (kg)");
    expect(fetch).not.toHaveBeenCalled();
  });
});
