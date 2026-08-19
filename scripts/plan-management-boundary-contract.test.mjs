import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const managerPath = new URL("../src/components/plan/program-manager.tsx", import.meta.url);
const panelPath = new URL("../src/components/plan/plan-management-panel.tsx", import.meta.url);
const schedulePath = new URL("../src/components/plan/plan-schedule-management.tsx", import.meta.url);

describe("plan management module boundary", () => {
  it("keeps local disclosure and pause-form state outside ProgramManager", async () => {
    const manager = await readFile(managerPath, "utf8");

    expect(manager).not.toContain("showProfileContext");
    expect(manager).not.toContain("showPauseForm");
    expect(manager).not.toContain("pauseResumeDate");
    expect(manager).not.toContain("<UnavailableDateManager");
    expect(manager).not.toContain("<ProfileContextForm");
  });

  it("makes the management panel own its local UI and clear submodules", async () => {
    const [panel, schedule] = await Promise.all([readFile(panelPath, "utf8"), readFile(schedulePath, "utf8")]);

    expect(panel).toContain("useState");
    expect(panel).toContain("PlanScheduleManagement");
    expect(panel).toContain("ProfileContextForm");
    expect(schedule).toContain("UnavailableDateManager");
    expect(schedule).toContain("pauseFormOpen");
  });
});
