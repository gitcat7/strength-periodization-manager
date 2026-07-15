/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

const router = { replace: vi.fn() };

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "user-1" } } } }) },
    from: mocks.from
  })
}));

import { TodayWorkout } from "./today-workout";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function createQuery(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const query = {
    eq: (...args: unknown[]) => {
      calls.push(["eq", args]);
      return query;
    },
    in: (...args: unknown[]) => {
      calls.push(["in", args]);
      return query;
    },
    limit: (...args: unknown[]) => {
      calls.push(["limit", args]);
      return query;
    },
    lt: (...args: unknown[]) => {
      calls.push(["lt", args]);
      return query;
    },
    maybeSingle: () => Promise.resolve(result),
    order: (...args: unknown[]) => {
      calls.push(["order", args]);
      return query;
    },
    select: (...args: unknown[]) => {
      calls.push(["select", args]);
      return query;
    }
  };
  return { calls, query };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  mocks.from.mockReset();
});

describe("TodayWorkout Fitness Coach", () => {
  it("looks up the last completed training day before calculating interruption advice", async () => {
    const program = createQuery({ data: { id: "program-1" }, error: null });
    const rest = createQuery({ data: null, error: null });
    const training = createQuery({
      data: { day_type: "training", id: "workout-1", name: "推 A · 强度", scheduled_date: "2026-07-16", sequence_index: 1, status: "scheduled" },
      error: null
    });
    const exercises = createQuery({ data: [], error: null });
    const lastCompleted = createQuery({ data: null, error: null });
    const queries = [program, rest, training, exercises, lastCompleted];
    mocks.from.mockImplementation(() => queries.shift()?.query);

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<TodayWorkout />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(lastCompleted.calls).toContainEqual(["eq", ["day_type", "training"]]);
    expect(lastCompleted.calls.findIndex(([method]) => method === "limit")).toBeGreaterThan(
      lastCompleted.calls.findIndex(([method, args]) => method === "eq" && args[0] === "day_type")
    );
  });
});
