/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { writeClientCache } from "@/lib/client-cache";

const router = { replace: vi.fn() };

vi.mock("next/navigation", () => ({ useRouter: () => router }));
let supabaseClient: ReturnType<typeof createSupabaseClient> = createSupabaseClient({ pendingAuth: true });

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => supabaseClient
}));

import { getProgramWeekCount, ProgramManager } from "./program-manager";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  supabaseClient = createSupabaseClient({ pendingAuth: true });
});

describe("ProgramManager cache hydration", () => {
  it("uses an existing program's actual duration when converting target body weight", () => {
    expect(getProgramWeekCount({ end_date: "2026-10-18", start_date: "2026-07-27" })).toBe(12);
  });

  it("keeps loading and does not render another account's cached plan before authentication resolves", () => {
    writeClientCache("strength-training-cache:plan", {
      program: {
        id: "previous-program",
        name: "另一账户的训练计划",
        template_type: "push_pull_squat",
        schedule_mode: "fixed_weekdays",
        schedule_config: { weekdays: [1, 3, 5] },
        custom_template_name: null,
        status: "active",
        start_date: "2026-07-01",
        end_date: "2026-07-28"
      },
      recommendationWeights: {},
      recommendations: [],
      userId: "previous-user",
      workoutExercises: [],
      workouts: []
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(<ProgramManager />));

    expect(container.textContent).toContain("正在读取当前训练计划");
    expect(container.textContent).not.toContain("另一账户的训练计划");
  });

  it("keeps the plan form usable when saving setup fails to load", async () => {
    supabaseClient = createSupabaseClient({ profileUpsertError: new TypeError("Load failed") });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const view = container;

    await act(async () => {
      root?.render(<ProgramManager />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const generateButton = Array.from(view.querySelectorAll("button")).find((button) => button.textContent?.includes("生成 4 周训练计划"));
    expect(generateButton).toBeTruthy();

    await act(async () => {
      selectValue(view.querySelector("select[aria-required='true']")!, "beginner");
      setInputValue(view.querySelector("input[aria-label='深蹲重量 kg']")!, "130");
      setInputValue(view.querySelector("input[aria-label='卧推重量 kg']")!, "90");
      setInputValue(view.querySelector("input[aria-label='硬拉重量 kg']")!, "150");
      setInputValue(view.querySelector("input[aria-label='推举重量 kg']")!, "50");
      generateButton?.click();
      await Promise.resolve();
    });

    expect(view.textContent).toContain("网络连接失败，请检查网络后重试。已填写的计划参数仍会保留。");
    expect(view.textContent).not.toContain("TypeError: Load failed");
    expect(generateButton).not.toHaveProperty("disabled", true);
  });

  it("shows a recoverable message when initial plan data loading fails", async () => {
    supabaseClient = createSupabaseClient({ profileLoadError: new TypeError("Load failed") });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ProgramManager />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("网络连接失败，请检查网络后刷新页面重试。已填写的计划参数不会丢失。");
    expect(container.textContent).not.toContain("TypeError: Load failed");
    expect(container.textContent).toContain("创建第一个计划");
  });

  it("shows a profile-only context entry for an existing plan", async () => {
    supabaseClient = createSupabaseClient({ activeProgram: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ProgramManager />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("更新体重、饮食与恢复");
  });

  it("shows management actions instead of a creation action for an existing plan", async () => {
    supabaseClient = createSupabaseClient({ activeProgram: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ProgramManager />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("调整计划");
    expect(container.textContent).toContain("重置计划");
    expect(container.textContent).not.toContain("生成 4 周训练计划");
  });
});

function createSupabaseClient({
  pendingAuth = false,
  profileLoadError,
  profileUpsertError,
  activeProgram = false
}: {
  pendingAuth?: boolean;
  profileLoadError?: Error;
  profileUpsertError?: Error;
  activeProgram?: boolean;
}) {
  const mainLifts = [
    { default_increment: 2.5, id: "squat", is_main_lift: true, name: "深蹲", slug: "squat" },
    { default_increment: 2.5, id: "bench", is_main_lift: true, name: "卧推", slug: "bench_press" },
    { default_increment: 2.5, id: "deadlift", is_main_lift: true, name: "硬拉", slug: "deadlift" },
    { default_increment: 2.5, id: "press", is_main_lift: true, name: "推举", slug: "overhead_press" }
  ];
  const createQuery = (result: unknown) => {
    const promise = result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    const query = Object.assign(promise, {
      eq: () => query,
      in: () => query,
      limit: () => query,
      maybeSingle: () => query,
      order: () => query,
      select: () => query
    });
    return query;
  };
  const profileTable = Object.assign(createQuery(profileLoadError ?? { data: null, error: null }), {
    upsert: () => profileUpsertError ? Promise.reject(profileUpsertError) : Promise.resolve({ error: null })
  });

  return {
    auth: { getUser: () => pendingAuth ? new Promise(() => {}) : Promise.resolve({ data: { user: { id: "user-1" } }, error: null }) },
    from: (table: string) => {
      if (table === "usr_athlete_profiles") return profileTable;
      if (table === "cfg_exercises") return createQuery({ data: mainLifts, error: null });
      if (table === "log_recommendations") return createQuery({ data: [], error: null });
      if (table === "plan_programs") {
        return createQuery({
          data: activeProgram ? {
            custom_template_name: null,
            end_date: "2026-08-23",
            id: "program-1",
            name: "当前训练计划",
            schedule_config: { weekdays: [1, 3, 5] },
            schedule_mode: "fixed_weekdays",
            start_date: "2026-07-27",
            status: "active",
            template_type: "push_pull_squat"
          } : null,
          error: null
        });
      }
      if (table === "usr_lift_profiles") return Object.assign(createQuery({ data: [], error: null }), { upsert: () => Promise.resolve({ error: null }) });
      return createQuery({ data: [], error: null });
    }
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function selectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}
