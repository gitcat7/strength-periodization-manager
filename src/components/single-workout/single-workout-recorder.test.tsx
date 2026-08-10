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
  vi.useRealTimers();
});

describe("SingleWorkoutRecorder", () => {
  it("uses an accessible full-size completion button and starts one rest prompt", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root?.render(<SingleWorkoutRecorder />));
    await addFirstReviewedExercise(container!);

    const firstSet = container!.querySelector<HTMLButtonElement>('button[aria-label="完成本组"]')!;
    expect(firstSet.textContent).toContain("完成本组");
    expect(firstSet.getAttribute("aria-pressed")).toBe("false");
    expect(firstSet.className).toContain("min-h-11");

    await act(async () => firstSet.click());

    expect(firstSet.textContent).toContain("已完成");
    expect(firstSet.getAttribute("aria-pressed")).toBe("true");
    expect(container!.textContent).toContain("休息中 01:30");
    expect(container!.textContent).toContain("+30 秒");
    expect(container!.textContent).toContain("跳过休息");

    await act(async () => clickButton(container!, "+30 秒"));
    expect(container!.textContent).toContain("休息中 02:00");
    await act(async () => clickButton(container!, "跳过休息"));
    expect(container!.querySelectorAll('[data-rest-timer="true"]')).toHaveLength(0);

    const weight = container!.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]')[0]!;
    await act(async () => setInputValue(weight, "22.5"));
    expect(weight).toHaveProperty("value", "22.5");
    expect(weight.className).toContain("min-w-0");
  });

  it("keeps a single rest timer, closes it when undone, and announces its end", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root?.render(<SingleWorkoutRecorder />));
    await addFirstReviewedExercise(container!);
    const buttons = container!.querySelectorAll<HTMLButtonElement>('button[aria-label="完成本组"]');

    await act(async () => buttons[0]?.click());
    await act(async () => buttons[1]?.click());
    expect(container!.querySelectorAll('[data-rest-timer="true"]')).toHaveLength(1);
    expect(container!.textContent).toContain("休息中 01:30");

    await act(async () => buttons[1]?.click());
    expect(container!.querySelectorAll('[data-rest-timer="true"]')).toHaveLength(0);

    await act(async () => buttons[2]?.click());
    await act(async () => { vi.advanceTimersByTime(90_000); });
    expect(container!.textContent).toContain("可以开始下一组");
  });

  it("cleans up the active rest interval when the recorder unmounts", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root?.render(<SingleWorkoutRecorder />));
    await addFirstReviewedExercise(container!);
    await act(async () => container!.querySelector<HTMLButtonElement>('button[aria-label="完成本组"]')?.click());
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await act(async () => root?.unmount());
    root = null;
    expect(vi.getTimerCount()).toBe(0);
  });
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

  it("does not start duration tracking when only adding or removing a set", async () => {
    const rpc = vi.fn(async (name: string) => name === "get_standalone_workout_draft" ? { data: null, error: null } : { data: { started_at: "2026-07-30T10:00:00.000Z", workout_id: "draft-1" }, error: null });
    vi.mocked(createBrowserSupabaseClient).mockReturnValue({ auth: { getSession: async () => ({ data: { session: { access_token: "test" } } }) }, rpc } as never);
    vi.stubGlobal("fetch", vi.fn());
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<SingleWorkoutRecorder />));
    await addFirstReviewedExercise(container!);
    await act(async () => clickButton(container!, "+ 增加一组"));
    await act(async () => clickButton(container!, "删除末组"));

    expect(rpc).not.toHaveBeenCalledWith("save_standalone_workout", expect.anything());
  });

  it("switches to a non-editable success state after the server saves a completed free workout", async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(createBrowserSupabaseClient).mockReturnValue({
      auth: { getSession: async () => ({ data: { session: { access_token: "test" } } }) },
      rpc: async (name: string) => name === "get_standalone_workout_draft"
        ? { data: null, error: null }
        : { data: { duration_seconds: 3600, started_at: "2026-07-30T10:00:00.000Z", workout_id: "workout-completed" }, error: null }
    } as never);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root?.render(<SingleWorkoutRecorder />));
    const addBench = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("添加"));
    await act(async () => addBench?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const complete = [...container.querySelectorAll("button")].find((button) => button.textContent === "完成训练");
    await act(async () => complete?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const duration = container.querySelector<HTMLInputElement>('input[aria-label="实际训练时长（分钟）"]');
    await act(async () => setInputValue(duration!, "60"));
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

  it("rejects the retired UUID-string save response instead of treating it as the JSONB RPC contract", async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(clearTrainingDataCaches).mockClear();
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
    const duration = container.querySelector<HTMLInputElement>('input[aria-label="实际训练时长（分钟）"]');
    await act(async () => setInputValue(duration!, "60"));
    const confirm = [...container.querySelectorAll("button")].find((button) => button.textContent === "仍然结束训练");
    await act(async () => confirm?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.textContent).toContain("训练已保存，但暂时无法定位该次记录。请前往全部历史查看。");
    expect(container.textContent).not.toContain("自由训练已完成");
    expect(clearTrainingDataCaches).not.toHaveBeenCalled();
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

async function addFirstReviewedExercise(view: HTMLElement) {
  const add = [...view.querySelectorAll("button")].find((button) => button.textContent?.includes("添加"));
  await act(async () => add?.click());
}

function clickButton(view: HTMLElement, label: string) {
  const button = [...view.querySelectorAll("button")].find((item) => item.textContent?.includes(label));
  if (!button) throw new Error(`button not found: ${label}`);
  button.click();
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
