import { describe, expect, it } from "vitest";

import { buildPlanPausePresentation } from "./plan-pause-presentation";

describe("plan pause presentation", () => {
  it("describes a paused plan with an upcoming manual recovery date", () => {
    expect(
      buildPlanPausePresentation({
        effectiveDate: "2026-08-29",
        nextTraining: { focus: "蹲，臀腿为主", name: "第 2 周 · 蹲 A · 强度" },
        reason: "fatigue",
        resumeDate: "2026-09-03",
        today: "2026-08-31"
      })
    ).toMatchObject({
      canResume: true,
      nextTrainingLabel: "第 2 周 · 蹲 A · 强度 · 蹲，臀腿为主",
      pausedDayLabel: "暂停第 3 天",
      reasonLabel: "疲劳累积，需要休整",
      resumeDateLabel: "预计恢复日期：2026-09-03",
      resumeDatePassed: false
    });
  });

  it("does not auto-resume after the estimated date and explains a missing pending workout", () => {
    expect(
      buildPlanPausePresentation({
        effectiveDate: "2026-08-20",
        nextTraining: null,
        reason: "time_conflict",
        resumeDate: "2026-08-30",
        today: "2026-08-31"
      })
    ).toMatchObject({
      canResume: false,
      noPendingReason: "当前周期没有待恢复训练日，无法恢复日程。",
      pausedDayLabel: "暂停第 12 天",
      reasonLabel: "工作/学习时间冲突",
      resumeDateLabel: "预计恢复日期：2026-08-30",
      resumeDatePassed: true
    });
  });

  it("uses a clear fallback when no recovery date was provided", () => {
    expect(
      buildPlanPausePresentation({
        effectiveDate: "2026-08-31",
        nextTraining: { focus: "推，胸/肩/三头为主", name: "第 1 周 · 推 A · 强度" },
        reason: null,
        resumeDate: null,
        today: "2026-08-31"
      })
    ).toMatchObject({
      pausedDayLabel: "暂停第 1 天",
      reasonLabel: "未说明原因",
      resumeDateLabel: "未设置恢复日期",
      resumeDatePassed: false
    });
  });

  it("keeps the overview readable when a legacy pause reason is unavailable", () => {
    expect(
      buildPlanPausePresentation({
        effectiveDate: "2026-08-31",
        nextTraining: null,
        reason: "legacy_reason" as never,
        resumeDate: null,
        today: "2026-08-31"
      }).reasonLabel
    ).toBe("未说明原因");
  });
});
