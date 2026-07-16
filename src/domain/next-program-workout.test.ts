import { describe, expect, it } from "vitest";
import { selectNextProgramWorkout } from "./next-program-workout";

describe("selectNextProgramWorkout", () => {
  const planned = { id: "planned-2", program_id: "active-plan", sequence_index: 2, status: "scheduled" };

  it("excludes an unplanned standalone draft from the home next workout", () => {
    expect(selectNextProgramWorkout([
      { id: "standalone-draft", program_id: null, sequence_index: 0, status: "draft" },
      planned
    ], "active-plan")).toEqual(planned);
  });

  it("leaves the active program's next session unchanged after a standalone workout exists", () => {
    expect(selectNextProgramWorkout([
      { id: "standalone-completed", program_id: null, sequence_index: 0, status: "completed" },
      { id: "another-plan", program_id: "archived-plan", sequence_index: 1, status: "scheduled" },
      planned,
      { id: "planned-3", program_id: "active-plan", sequence_index: 3, status: "scheduled" }
    ], "active-plan")).toEqual(planned);
  });
});
