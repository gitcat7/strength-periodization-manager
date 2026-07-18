import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getHistoryMonthBounds, normalizeHistoryMonth } from "./training-history";

const componentPath = fileURLToPath(new URL("./training-history.tsx", import.meta.url));

describe("history calendar month boundaries", () => {
  it("normalizes a visible month and builds a bounded scheduled-date query range", () => {
    const month = normalizeHistoryMonth(new Date(2026, 6, 18));

    expect(month).toEqual(new Date(2026, 6, 1));
    expect(getHistoryMonthBounds(month)).toEqual({
      monthStart: "2026-07-01",
      nextMonthStart: "2026-08-01"
    });
  });

  it("never advances the calendar beyond the current month", () => {
    expect(normalizeHistoryMonth(new Date(2026, 7, 1), new Date(2026, 6, 18))).toEqual(new Date(2026, 6, 1));
  });

  it("keeps focused history access inside the user-scoped bounded month query", async () => {
    const component = await readFile(componentPath, "utf8");

    expect(component).toContain('.eq("user_id", user.id).gte("scheduled_date", monthStart).lt("scheduled_date", nextMonthStart)');
    expect(component).toContain("getHistoryWorkoutFocusId(historySearch, workouts)");
    expect(component).toContain('href={`/history?workout=${workout.id}`}');
  });

  it("preserves the last loaded month while a new month is loading or retried", async () => {
    const component = await readFile(componentPath, "utf8");

    expect(component).toContain("const [loadedMonth, setLoadedMonth]");
    expect(component).toContain("setLoadedMonth(visibleMonth)");
    expect(component).toContain("重新加载本月");
  });
});
