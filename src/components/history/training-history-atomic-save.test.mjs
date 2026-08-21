import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const historyPath = new URL("./training-history.tsx", import.meta.url);

describe("history workout revisions", () => {
  test("recomputes server-side scientific recommendations with the single revision RPC", async () => {
    const source = await readFile(historyPath, "utf8");
    expect(source).toContain('rpc("revise_completed_workout_logs"');
  });
});
