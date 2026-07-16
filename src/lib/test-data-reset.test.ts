import { describe, expect, it, vi } from "vitest";

import { deleteUserGeneratedData, userGeneratedDataTables } from "./test-data-reset";

describe("deleteUserGeneratedData", () => {
  it("clears user-generated records in dependency-safe order without touching accounts or exercises", async () => {
    const calls: string[] = [];
    const supabase = {
      from(table: string) {
        calls.push(table);
        return {
          delete: () => ({ not: () => Promise.resolve({ error: null }) })
        };
      }
    };

    await expect(deleteUserGeneratedData(supabase)).resolves.toEqual({ deletedTables: userGeneratedDataTables });

    expect(calls).toEqual(userGeneratedDataTables);
    expect(calls).not.toContain("exercises");
    expect(calls).not.toContain("users");
  });

  it("stops and reports the table when deletion fails", async () => {
    const supabase = {
      from: vi.fn((table: string) => ({
        delete: () => ({ not: () => Promise.resolve({ error: table === "pr_goals" ? { message: "blocked" } : null }) })
      }))
    };

    await expect(deleteUserGeneratedData(supabase)).rejects.toThrow("pr_goals: blocked");
  });
});
