/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";

import { AdvancedSettingsDisclosure } from "./advanced-settings-disclosure";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps advanced settings unfocusable until the user expands them", () => {
  const view = document.createElement("div");
  const root = createRoot(view);
  act(() => root.render(
    <AdvancedSettingsDisclosure>
      <a href="/diagnostics">Agent 授权内容</a>
    </AdvancedSettingsDisclosure>
  ));

  const button = view.querySelector("button");
  expect(button?.textContent).toContain("高级功能");
  expect(button?.getAttribute("aria-expanded")).toBe("false");
  expect(button?.className).toContain("h-11");
  expect(view.textContent).not.toContain("Agent 授权内容");
  expect(view.querySelector("a")).toBeNull();

  act(() => button?.click());
  expect(button?.getAttribute("aria-expanded")).toBe("true");
  expect(view.textContent).toContain("Agent 授权内容");

  act(() => button?.click());
  expect(button?.getAttribute("aria-expanded")).toBe("false");
  expect(view.textContent).not.toContain("Agent 授权内容");
  act(() => root.unmount());
});
