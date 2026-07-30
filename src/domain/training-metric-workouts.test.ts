import { describe, expect, it } from "vitest";
import { filterTrainingMetricWorkouts, isMetricEligibleWorkout } from "./training-metric-workouts";

describe("isMetricEligibleWorkout", () => {
  it("never counts a recovery_strategy skipped workout as a training metric", () => {
    expect(isMetricEligibleWorkout({ dayType: "training", status: "skipped", skipReason: "recovery_strategy" })).toBe(false);
    expect(isMetricEligibleWorkout({ day_type: "training", status: "skipped", skip_reason: "recovery_strategy" })).toBe(false);
  });

  it("excludes rest rows and any skipped rows regardless of reason", () => {
    expect(isMetricEligibleWorkout({ dayType: "rest", status: "completed" })).toBe(false);
    expect(isMetricEligibleWorkout({ dayType: "training", status: "skipped", skipReason: null })).toBe(false);
  });

  it("keeps completed, failed, and standalone training rows eligible", () => {
    expect(isMetricEligibleWorkout({ dayType: "training", status: "completed" })).toBe(true);
    expect(isMetricEligibleWorkout({ dayType: "training", status: "failed" })).toBe(true);
    expect(isMetricEligibleWorkout({ day_type: "training", status: "completed" })).toBe(true);
  });
});

describe("filterTrainingMetricWorkouts", () => {
  it("drops recovery-strategy skipped rows from volume, e1RM, and completion inputs", () => {
    const rows = [
      { id: "skipped", dayType: "training", status: "skipped", skipReason: "recovery_strategy", volume: 5000, completedSets: 0 },
      { id: "done", dayType: "training", status: "completed", volume: 1200, completedSets: 3 }
    ];

    expect(filterTrainingMetricWorkouts(rows)).toEqual([rows[1]]);
  });

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

  it("filters database-shaped rest rows before a capped strength metric query", () => {
    const completedRows = [
      { day_type: "rest", id: "rest", volume: 9999 },
      { day_type: "training", id: "training", volume: 1200 }
    ];

    expect(filterTrainingMetricWorkouts(completedRows)).toEqual([completedRows[1]]);
  });

  it("keeps a completed standalone training row in history and strength metrics", () => {
    const standaloneWorkout = { day_type: "training", id: "standalone", program_id: null, volume: 950 };
    expect(filterTrainingMetricWorkouts([standaloneWorkout])).toEqual([standaloneWorkout]);
  });
});
