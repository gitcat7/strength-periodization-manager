import { describe, expect, it } from "vitest";

import { completeRestDayCheckIn, getCurrentRestItem } from "./rest-day-actions";

function createUpdateQuery(result: { data: { id: string } | null; error: unknown }) {
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
    maybeSingle: () => Promise.resolve(result),
    select: (...args: unknown[]) => {
      calls.push(["select", args]);
      return query;
    },
    update: (...args: unknown[]) => {
      calls.push(["update", args]);
      return query;
    }
  };
  return { calls, query };
}

describe("getCurrentRestItem", () => {
  it("drops a cached rest item after midnight instead of restoring it as today\'s rest day", () => {
    expect(
      getCurrentRestItem(
        { dayType: "rest", id: "rest-yesterday", scheduledDate: "2026-07-14", status: "scheduled" },
        "2026-07-15"
      )
    ).toBeNull();
  });
});

describe("completeRestDayCheckIn", () => {
  it("sends only status and completed_at through an owned, date-exact rest update", async () => {
    const { calls, query } = createUpdateQuery({ data: { id: "rest-today" }, error: null });
    const from = (table: string) => {
      expect(table).toBe("workouts");
      return query;
    };

    await expect(
      completeRestDayCheckIn({
        from,
        item: { dayType: "rest", id: "rest-today", scheduledDate: "2026-07-15", status: "scheduled" },
        today: "2026-07-15",
        userId: "user-1"
      })
    ).resolves.toEqual({ data: { id: "rest-today" }, error: null });

    expect(calls).toContainEqual(["update", [expect.objectContaining({ completed_at: expect.any(String), status: "completed" })]]);
    const update = calls.find(([method]) => method === "update")?.[1][0] as Record<string, unknown>;
    expect(Object.keys(update).sort()).toEqual(["completed_at", "status"]);
    expect(calls).toContainEqual(["eq", ["id", "rest-today"]]);
    expect(calls).toContainEqual(["eq", ["user_id", "user-1"]]);
    expect(calls).toContainEqual(["eq", ["day_type", "rest"]]);
    expect(calls).toContainEqual(["eq", ["scheduled_date", "2026-07-15"]]);
    expect(calls).toContainEqual(["in", ["status", ["scheduled", "draft"]]]);
  });

  it("does not issue an update when a cached rest item belongs to a prior date", async () => {
    const from = () => {
      throw new Error("a stale rest item must not be completable");
    };

    await expect(
      completeRestDayCheckIn({
        from,
        item: { dayType: "rest", id: "rest-yesterday", scheduledDate: "2026-07-14", status: "scheduled" },
        today: "2026-07-15",
        userId: "user-1"
      })
    ).resolves.toEqual({ data: null, error: null });
  });
});
