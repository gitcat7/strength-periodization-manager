/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PlanSetupForm } from "./program-manager";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("PlanSetupForm", () => {
  it("shows the first-plan setup and retains a working-set input", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(
      <PlanSetupForm
        errors={{ lifts: "至少录入一个主项最近工作组" }}
        mainLifts={[{ id: "bench", slug: "bench_press", name: "卧推", default_increment: 2.5 }]}
        onChange={() => undefined}
        value={{
          experienceLevel: "beginner",
          goal: "strength",
          injuryNotes: "",
          lifts: [{ exerciseId: "bench", weightKg: "80", reps: "5" }],
          trainingDaysPerWeek: 3
        }}
      />
    ));

    expect(container.textContent).toContain("训练安排与主项最近工作组");
    expect(container.querySelector('input[aria-label="卧推重量 kg"]')).toHaveProperty("value", "80");
    expect(container.textContent).toContain("至少录入一个主项最近工作组");
    expect(container.textContent).toContain("增肌（Hypertrophy）");
    expect(container.textContent).not.toContain("单次时长");
    expect(container.textContent).not.toContain("可训练日");
  });
});
