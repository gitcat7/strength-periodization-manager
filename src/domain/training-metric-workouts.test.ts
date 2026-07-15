import { describe, expect, it } from "vitest";
import { filterTrainingMetricWorkouts } from "./training-metric-workouts";

describe("filterTrainingMetricWorkouts", () => {
  it("excludes completed rest rows from volume, e1RM, and strength completion inputs", () => {
    const completedRows = [
      { id: "rest", dayType: "rest", completedSets: 0, plannedSets: 0, volume: 0, e1rmInput: null },
      { id: "training", dayType: "training", completedSets: 3, plannedSets: 3, volume: 1200, e1rmInput: [100, 5] }
    ];

    const metricRows = filterTrainingMetricWorkouts(completedRows);

    expect(metricRows).toEqual([completedRows[1]]);
    expect(metricRows.reduce((total, row) => total + row.volume, 0)).toBe(1200);
    expect(metricRows.flatMap((row) => (row.e1rmInput ? [row.e1rmInput] : []))).toEqual([[100, 5]]);
    expect(metricRows.reduce((total, row) => total + row.completedSets, 0)).toBe(3);
    expect(metricRows.reduce((total, row) => total + row.plannedSets, 0)).toBe(3);
  });
});
