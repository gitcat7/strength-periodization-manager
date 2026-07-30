import { describe, expect, it } from "vitest";

import { buildScheduleReflowPayload, type ReflowInput } from "./schedule-reflow-payload";

function fixture(
  overrides: Partial<{
    action: ReflowInput["action"];
    expectedRevision: number;
    route: ReflowInput["route"];
    reason: ReflowInput["reason"];
    effectiveDate: string;
    scheduleItems: ReflowInput["scheduleItems"];
  }> = {}
): ReflowInput {
  return {
    programId: "00000000-0000-0000-0000-000000002001",
    action: overrides.action ?? "resume",
    expectedRevision: overrides.expectedRevision ?? 1,
    route: overrides.route,
    reason: overrides.reason,
    effectiveDate: overrides.effectiveDate ?? "2026-08-20",
    scheduleItems: overrides.scheduleItems ?? [
      {
        workoutId: "00000000-0000-0000-0000-000000002403",
        scheduledDate: "2026-08-21",
        scheduleIndex: 4,
        sequenceIndex: 15,
        dayType: "training",
        status: "skipped"
      },
      {
        workoutId: "00000000-0000-0000-0000-000000002404",
        scheduledDate: "2026-08-23",
        scheduleIndex: 5,
        sequenceIndex: 18,
        dayType: "training",
        status: "scheduled"
      }
    ]
  };
}

describe("buildScheduleReflowPayload", () => {
  it("carries the user-selected resume route and expected revision", () => {
    expect(buildScheduleReflowPayload(fixture({ expectedRevision: 4, route: "start_next_cycle" }))).toMatchObject({
      action: "resume",
      expected_revision: 4,
      resume_route: "start_next_cycle"
    });
  });

  it("marks skipped items with the recovery strategy reason only", () => {
    const payload = buildScheduleReflowPayload(fixture({ route: "start_next_cycle" }));

    expect(payload.schedule_items[0]).toMatchObject({ status: "skipped", skip_reason: "recovery_strategy" });
    expect(payload.schedule_items[1]).toMatchObject({ status: "scheduled" });
    expect(payload.schedule_items[1]).not.toHaveProperty("skip_reason");
  });

  it("requires an explicit route for resume actions", () => {
    expect(() => buildScheduleReflowPayload(fixture({ route: undefined }))).toThrow(
      "恢复训练需要选择恢复路线。"
    );
  });

  it("omits the resume route for non-resume actions", () => {
    const payload = buildScheduleReflowPayload(
      fixture({ action: "extra_rest", route: "start_next_cycle", reason: "fatigue" })
    );

    expect(payload).not.toHaveProperty("resume_route");
    expect(payload).toMatchObject({ action: "extra_rest", reason: "fatigue" });
  });

  it("never includes a user id, relying on database ownership", () => {
    const payload = buildScheduleReflowPayload(fixture({ route: "continue_current_cycle" }));

    expect(JSON.stringify(payload)).not.toContain("user_id");
    expect(payload).not.toHaveProperty("user_id");
  });

  it("rejects invalid revisions and effective dates", () => {
    expect(() => buildScheduleReflowPayload(fixture({ expectedRevision: 0 }))).toThrow();
    expect(() => buildScheduleReflowPayload(fixture({ effectiveDate: "2026/08/20" }))).toThrow();
  });
});
