import { describe, expect, it } from "vitest";

import { getFocusTrapTarget } from "./program-regeneration-dialog-focus";

describe("getFocusTrapTarget", () => {
  const first = { id: "cancel" } as HTMLElement;
  const middle = { id: "confirm" } as HTMLElement;
  const last = { id: "retry" } as HTMLElement;
  const focusable = [first, middle, last];

  it("wraps Tab from the last control to the first control", () => {
    expect(getFocusTrapTarget(focusable, last, false)).toBe(first);
  });

  it("wraps Shift+Tab from the first control to the last control", () => {
    expect(getFocusTrapTarget(focusable, first, true)).toBe(last);
  });

  it("redirects focus entering from outside the dialog", () => {
    expect(getFocusTrapTarget(focusable, null, false)).toBe(first);
    expect(getFocusTrapTarget(focusable, null, true)).toBe(last);
  });
});
