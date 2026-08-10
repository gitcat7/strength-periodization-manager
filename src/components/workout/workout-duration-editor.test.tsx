/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkoutDurationEditor } from "./workout-duration-editor";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe("WorkoutDurationEditor", () => {
  it("shows the automatic value, reminder, and opens manual correction", () => {
    const onManualMinutesChange = vi.fn();
    const onManualModeChange = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(
      <WorkoutDurationEditor
        automaticMinutes={62}
        manualMinutes=""
        manualMode={false}
        onManualMinutesChange={onManualMinutesChange}
        onManualModeChange={onManualModeChange}
      />
    ));

    expect(container.textContent).toContain("自动记录时长：1 小时 2 分钟");
    expect(container.textContent).toContain("如果训练结束后忘记及时点击完成，请检查并修改时长。");
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "修改时长");
    act(() => button?.click());
    expect(onManualModeChange).toHaveBeenCalledWith(true);
  });
});
