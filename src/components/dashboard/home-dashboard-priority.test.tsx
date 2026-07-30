/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => {
    const rows: Record<string, unknown[]> = {
      plan_programs: [{ id: "program-1", status: "active", user_id: "user-1" }],
      plan_workouts: [
        { day_type: "training", id: "next-1", name: "推 A", program_id: "program-1", scheduled_date: "2026-07-30", sequence_index: 2, status: "scheduled", user_id: "user-1" },
        { day_type: "training", id: "done-1", name: "拉 B", program_id: "program-1", scheduled_date: "2026-07-28", sequence_index: 1, status: "completed", user_id: "user-1" }
      ],
      plan_workout_exercises: [
        { exercises: { name: "杠铃卧推", slug: "barbell_bench_press" }, id: "next-exercise", order_index: 0, target_reps: 5, target_sets: 3, target_weight: 100, workout_id: "next-1" },
        { exercises: { name: "杠铃划船", slug: "barbell_row" }, id: "done-exercise", order_index: 0, target_reps: 8, target_sets: 3, target_weight: 80, workout_id: "done-1" }
      ],
      log_set_logs: [{ actual_reps: 8, actual_weight: 80, completed: true, workout_exercise_id: "done-exercise" }],
      log_recommendations: [
        { exercises: { name: "卧推" }, id: "rec-1", previous_weight: 100, reason: "第一条建议", recommendation_type: "increase", status: "pending", suggested_weight: 102.5, user_id: "user-1" },
        { exercises: { name: "划船" }, id: "rec-2", previous_weight: 80, reason: "第二条建议", recommendation_type: "hold", status: "pending", suggested_weight: 80, user_id: "user-1" }
      ],
      log_pr_goals: [{ exercises: { name: "卧推" }, id: "pr-1", status: "active", target_date: "2026-08-30", target_weight: 120, user_id: "user-1" }]
    };
    function from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        eq(key: string, value: unknown) { filters[key] = value; return builder; },
        in(key: string, value: unknown) { filters[key] = value; return builder; },
        limit() { return builder; },
        order() { return builder; },
        select() { return builder; },
        maybeSingle() {
          return Promise.resolve({ data: selectRows()[0] ?? null, error: null });
        },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          return Promise.resolve({ data: selectRows(), error: null }).then(resolve, reject);
        }
      };
      function selectRows() {
        return (rows[table] ?? []).filter((row) =>
          Object.entries(filters).every(([key, value]) => {
            const actual = (row as Record<string, unknown>)[key];
            return Array.isArray(value) ? value.includes(actual) : actual === value;
          })
        );
      }
      return builder;
    }
    return {
      auth: { getSession: () => Promise.resolve({ data: { session: { user: { email: "athlete@example.com", id: "user-1" } } }, error: null }) },
      from
    };
  }
}));

import { HomeDashboard } from "./home-dashboard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  window.localStorage.clear();
});

it("prioritizes the next workout with one primary action and compact summaries", async () => {
  const view = document.createElement("div");
  root = createRoot(view);
  await act(async () => {
    root?.render(<HomeDashboard />);
    await new Promise((resolve) => window.setTimeout(resolve, 10));
  });

  const content = view.textContent ?? "";
  expect(content).toContain("下一次训练");
  expect(content).toContain("最近一次训练");
  expect(content.indexOf("下一次训练")).toBeLessThan(content.indexOf("最近一次训练"));
  const management = content.indexOf("训练管理");
  const primaryToday = [...view.querySelectorAll<HTMLAnchorElement>("a")]
    .filter((link) => link.getAttribute("href") === "/today" && link.className.includes("bg-action"));
  expect(primaryToday).toHaveLength(1);
  expect(primaryToday[0]?.textContent).toContain("继续训练");
  expect(content.indexOf("继续训练")).toBeLessThan(management);

  const freeTraining = view.querySelector<HTMLAnchorElement>('a[href="/single-workout"]');
  expect(freeTraining?.textContent).toContain("自由训练");
  expect(freeTraining?.className).toContain("h-11");
  expect(freeTraining?.className).toContain("border");
  expect(primaryToday[0]?.className).toContain("h-11");

  expect(content).toContain("第一条建议");
  expect(content).not.toContain("第二条建议");
  expect(content).toContain("另有 1 条待处理建议");
  const metrics = view.querySelector("[data-home-metrics]");
  expect(metrics?.className).toContain("grid-cols-3");
  expect([...metrics!.children].every((metric) => metric.className.includes("min-w-0"))).toBe(true);
});
