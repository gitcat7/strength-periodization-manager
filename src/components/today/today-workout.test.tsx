/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { writeClientCache } from "@/lib/client-cache";

const router = { replace: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      getSession: () => new Promise(() => {})
    }
  })
}));

import { TodayWorkout } from "./today-workout";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.useRealTimers();
});

describe("TodayWorkout cache hydration", () => {
  it("keeps loading instead of rendering no-plan when a stale rest cache has a next training session", () => {
    vi.useFakeTimers();
    writeClientCache("strength-training-cache:today", {
      coachRecommendations: [],
      exercises: [],
      lastCompletedWorkout: null,
      nextTraining: {
        dayType: "training",
        id: "training-next",
        name: "推 A · 强度",
        scheduledDate: "2026-07-16",
        sequenceIndex: 3,
        status: "scheduled"
      },
      restItem: {
        dayType: "rest",
        id: "rest-yesterday",
        scheduledDate: "2026-07-15",
        status: "scheduled"
      },
      setLogs: {},
      userId: "user-1",
      workout: null
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(<TodayWorkout />));

    expect(container.textContent).toContain("正在读取今日训练");
    expect(container.textContent).not.toContain("还没有可执行的训练计划");
  });
});
