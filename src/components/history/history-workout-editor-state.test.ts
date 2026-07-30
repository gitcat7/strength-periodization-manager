import { describe, expect, it } from "vitest";

import {
  createHistoryWorkoutEditorState,
  parseHistoryDurationMinutes,
  reduceHistoryWorkoutEditor,
  type HistoryEditableSet
} from "./history-workout-editor-state";

const log: HistoryEditableSet = {
  actual_reps: 5,
  actual_weight: 80,
  completed: true,
  id: "log-1",
  rpe: 8,
  set_index: 1,
  target_reps: 5,
  target_weight: 80,
  workout_exercise_id: "exercise-1"
};

describe("history workout editor state", () => {
  it("copies loaded values into a draft and cancel discards every change", () => {
    const editing = reduceHistoryWorkoutEditor(createHistoryWorkoutEditorState(), {
      type: "begin",
      durationSeconds: 2700,
      logs: [log]
    });
    const changed = reduceHistoryWorkoutEditor(editing, {
      type: "changeLog",
      id: log.id,
      patch: { actual_weight: 82.5 }
    });

    expect(changed.logs[0].actual_weight).toBe(82.5);
    expect(log.actual_weight).toBe(80);
    expect(reduceHistoryWorkoutEditor(changed, { type: "cancel" }))
      .toEqual(createHistoryWorkoutEditorState());
  });

  it("keeps the draft editable after a save failure", () => {
    const editing = reduceHistoryWorkoutEditor(createHistoryWorkoutEditorState(), {
      type: "begin",
      durationSeconds: 2700,
      logs: [log]
    });
    const saving = reduceHistoryWorkoutEditor(editing, { type: "save" });
    const failed = reduceHistoryWorkoutEditor(saving, {
      type: "saveFailed",
      message: "网络连接失败，请重试。"
    });

    expect(failed.mode).toBe("edit");
    expect(failed.logs).toEqual(editing.logs);
    expect(failed.error).toBe("网络连接失败，请重试。");
  });

  it("returns to read mode with fresh saved values", () => {
    const editing = reduceHistoryWorkoutEditor(createHistoryWorkoutEditorState(), {
      type: "begin",
      durationSeconds: null,
      logs: [log]
    });
    const saved = { ...log, actual_weight: 82.5 };
    const succeeded = reduceHistoryWorkoutEditor(editing, {
      type: "saveSucceeded",
      durationSeconds: 3000,
      logs: [saved]
    });

    expect(succeeded).toEqual(createHistoryWorkoutEditorState());
    expect(saved.actual_weight).toBe(82.5);
  });

  it.each([
    ["", { ok: true, seconds: null }],
    ["1", { ok: true, seconds: 60 }],
    ["45", { ok: true, seconds: 2700 }],
    ["720", { ok: true, seconds: 43200 }]
  ])("accepts history duration %s", (value, expected) => {
    expect(parseHistoryDurationMinutes(value)).toEqual(expected);
  });

  it.each(["0", "721", "1.5", "abc"])("rejects invalid history duration %s", (value) => {
    expect(parseHistoryDurationMinutes(value)).toEqual({
      ok: false,
      message: "训练时长请输入 1–720 的整数分钟。"
    });
  });
});
