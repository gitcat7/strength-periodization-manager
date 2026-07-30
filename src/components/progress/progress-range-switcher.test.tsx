/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import { ProgressRangeSwitcher } from "./progress-range-switcher";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("shows three 44px range buttons and reports selection", () => {
  const onChange = vi.fn();
  const view = document.createElement("div");
  const root = createRoot(view);
  act(() => root.render(<ProgressRangeSwitcher onChange={onChange} value={8} />));
  const buttons = [...view.querySelectorAll("button")];
  expect(buttons.map((button) => button.textContent)).toEqual(["4周", "8周", "12周"]);
  expect(buttons.every((button) => button.className.includes("h-11"))).toBe(true);
  expect(buttons[1]?.getAttribute("aria-pressed")).toBe("true");
  act(() => buttons[0]?.click());
  expect(onChange).toHaveBeenCalledWith(4);
  act(() => root.unmount());
});
