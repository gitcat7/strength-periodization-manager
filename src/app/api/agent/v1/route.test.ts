import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAgentRequest: vi.fn(),
  from: vi.fn()
}));

vi.mock("@/lib/agent-auth", () => ({
  authenticateAgentRequest: mocks.authenticateAgentRequest
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ from: mocks.from })
}));

import { POST } from "./route";

type QueryResult = { data: unknown; error: unknown };

function createQuery(result: QueryResult) {
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
    maybeSingle: () => Promise.resolve(result),
    order: (...args: unknown[]) => {
      calls.push(["order", args]);
      return query;
    },
    select: (...args: unknown[]) => {
      calls.push(["select", args]);
      return query;
    },
    single: () => Promise.resolve(result),
    update: (...args: unknown[]) => {
      calls.push(["update", args]);
      return query;
    },
    then: <TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) => Promise.resolve(result).then(onfulfilled, onrejected)
  };
  return { calls, query };
}

function authorizedRequest(body: unknown) {
  return new Request("https://example.test/api/agent/v1", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
}

describe("Agent API rest-day boundaries", () => {
  it("loads completed history only from training rows before applying the limit", async () => {
    const history = createQuery({ data: [], error: null });
    mocks.authenticateAgentRequest.mockResolvedValue({ tokenId: "token-1", userId: "user-1" });
    mocks.from.mockReturnValue(history.query);

    await expect(POST(authorizedRequest({ action: "history", limit: 3 }))).resolves.toHaveProperty("status", 200);

    expect(history.calls).toContainEqual(["eq", ["day_type", "training"]]);
    expect(history.calls.findIndex(([method]) => method === "limit")).toBeGreaterThan(
      history.calls.findIndex(([method, args]) => method === "eq" && args[0] === "day_type")
    );
  });

  it("returns plan rows with day type in chronological schedule order", async () => {
    const program = createQuery({ data: { id: "program-1", name: "计划" }, error: null });
    const workouts = createQuery({ data: [], error: null });
    mocks.authenticateAgentRequest.mockResolvedValue({ tokenId: "token-1", userId: "user-1" });
    mocks.from.mockImplementation((table: string) => (table === "programs" ? program.query : workouts.query));

    await expect(POST(authorizedRequest({ action: "plan" }))).resolves.toHaveProperty("status", 200);

    expect(workouts.calls).toContainEqual(["select", [expect.stringContaining("day_type")]]);
    expect(workouts.calls).toContainEqual(["order", ["schedule_index", { ascending: true }]]);
  });

  it("only completes a training workout through the strength completion action", async () => {
    const ownership = createQuery({ data: { id: "11111111-1111-4111-8111-111111111111" }, error: null });
    const completion = createQuery({
      data: { id: "11111111-1111-4111-8111-111111111111", name: "推 A", scheduled_date: "2026-07-16", status: "completed" },
      error: null
    });
    mocks.authenticateAgentRequest.mockResolvedValue({ tokenId: "token-1", userId: "user-1" });
    mocks.from.mockImplementationOnce(() => ownership.query).mockImplementationOnce(() => completion.query);

    await expect(
      POST(authorizedRequest({ action: "complete_workout", workout_id: "11111111-1111-4111-8111-111111111111" }))
    ).resolves.toHaveProperty("status", 200);

    expect(completion.calls).toContainEqual(["eq", ["day_type", "training"]]);
  });
});
