/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: vi.fn(() => ({
    auth: { getSession: async () => ({ data: { session: { access_token: "test" } } }) },
    rpc: async () => ({ data: null, error: null })
  }))
}));
vi.mock("@/lib/client-cache", () => ({ clearTrainingDataCaches: vi.fn() }));

import { SingleWorkoutRecorder } from "./single-workout-recorder";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { clearTrainingDataCaches } from "@/lib/client-cache";

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

  it("switches to a non-editable success state after the server saves a completed free workout", async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(createBrowserSupabaseClient).mockReturnValue({
      auth: { getSession: async () => ({ data: { session: { access_token: "test" } } }) },
      rpc: async (name: string) => name === "get_standalone_workout_draft"
        ? { data: null, error: null }
        : { data: "workout-completed", error: null }
    } as never);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root?.render(<SingleWorkoutRecorder />));
    const addBench = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("添加"));
    await act(async () => addBench?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const complete = [...container.querySelectorAll("button")].find((button) => button.textContent === "完成训练");
    await act(async () => complete?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const confirm = [...container.querySelectorAll("button")].find((button) => button.textContent === "仍然结束训练");
    await act(async () => confirm?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.textContent).toContain("自由训练已完成");
    expect(container.textContent).toContain("不适用");
    expect(container.textContent).not.toContain("添加动作");
    expect(container.textContent).not.toContain("重量 (kg)");
    expect(container.querySelector('a[href="/history?workout=workout-completed"]')).toBeTruthy();
    expect(container.querySelector('a[href="/history"]')).toBeTruthy();
    expect(container.querySelector('a[href="/"]')).toBeTruthy();
    expect(clearTrainingDataCaches).toHaveBeenCalledOnce();
  });

  it("allows an audited cardio exercise to finish without an RPE value", async () => {
    vi.stubGlobal("fetch", vi.fn());
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root?.render(<SingleWorkoutRecorder />));
    const search = container.querySelector<HTMLInputElement>('input[type="search"]');
    await act(async () => setInputValue(search!, "跑步机"));

    const treadmill = [...container.querySelectorAll("details")].find((item) => item.textContent?.includes("跑步机跑步"));
    const add = [...(treadmill?.querySelectorAll("button") ?? [])].find((button) => button.textContent?.includes("添加"));
    await act(async () => add?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const inputs = container.querySelectorAll<HTMLInputElement>("input");
    await act(async () => {
      [5, 8, 11].forEach((index) => setInputValue(inputs[index]!, "30"));
    });
    const completeSetButtons = container.querySelectorAll<HTMLButtonElement>('button[aria-label="完成本组"]');
    await act(async () => completeSetButtons.forEach((button) => button.dispatchEvent(new MouseEvent("click", { bubbles: true }))));
    const completeWorkout = [...container.querySelectorAll("button")].find((button) => button.textContent === "完成训练");
    await act(async () => completeWorkout?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.textContent).toContain("本次训练摘要");
    expect(container.textContent).not.toContain("RPE 需为 1–10。");
  });
});

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
