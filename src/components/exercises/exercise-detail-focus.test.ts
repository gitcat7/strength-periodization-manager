import { describe, expect, it, vi } from "vitest";
import { createDetailFocusManager, getNextDialogFocusTarget } from "./exercise-detail-focus";

type FocusTarget = {
  focus: ReturnType<typeof vi.fn>;
};

function createTarget(): FocusTarget {
  return { focus: vi.fn() };
}

describe("getNextDialogFocusTarget", () => {
  it("wraps Tab from the last dialog control to the first", () => {
    const first = createTarget();
    const last = createTarget();

    expect(getNextDialogFocusTarget([first, last], last, false)).toBe(first);
  });

  it("wraps Shift+Tab from the first dialog control to the last", () => {
    const first = createTarget();
    const last = createTarget();

    expect(getNextDialogFocusTarget([first, last], first, true)).toBe(last);
  });
});

describe("createDetailFocusManager", () => {
  it("restores focus to the launcher after closing on desktop", () => {
    const launcher = createTarget();
    const focusManager = createDetailFocusManager();

    focusManager.capture(launcher);
    focusManager.restore();

    expect(launcher.focus).toHaveBeenCalledOnce();
  });
});
