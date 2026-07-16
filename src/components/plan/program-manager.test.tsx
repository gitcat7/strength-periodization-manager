/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { writeClientCache } from "@/lib/client-cache";

const router = { replace: vi.fn() };

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { getUser: () => new Promise(() => {}) }
  })
}));

import { ProgramManager } from "./program-manager";

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
});

describe("ProgramManager cache hydration", () => {
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
});
