import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { getHistoryMonthBounds, normalizeHistoryMonth } from "./training-history";

const componentPath = fileURLToPath(new URL("./training-history.tsx", import.meta.url));

describe("history calendar date selection", () => {
  it("queries only the visible month and clears the selected day on navigation", async () => {
    const month = normalizeHistoryMonth(new Date(2026, 6, 18));
    expect(getHistoryMonthBounds(month)).toEqual({ monthStart: "2026-07-01", nextMonthStart: "2026-08-01" });

    const component = await readFile(componentPath, "utf8");
    expect(component).toContain('.eq("user_id", user.id).gte("scheduled_date", monthStart).lt("scheduled_date", nextMonthStart)');
    expect(component).toContain("function moveVisibleMonth(offset: number)");
    expect(component).toContain("setSelectedDate(null);");
  });

  it("keeps detailed records scoped to the selected day instead of rendering every completed workout", async () => {
    const component = await readFile(componentPath, "utf8");
    expect(component).toContain("selectHistoryDetailWorkouts(selectedDate, calendarDays, workouts)");
    expect(component).toContain("{detailWorkouts.map((workout) => {");
    expect(component).not.toContain('{workouts.filter((workout) => workout.status === "completed").map((workout) => {');
    expect(component).toContain("请选择一个有训练安排或记录的日期");
  });
});
