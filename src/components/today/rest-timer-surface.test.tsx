/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { RestTimerSurface, type RestTimerSurfaceProps } from "./rest-timer-surface";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const defaults: RestTimerSurfaceProps = {
  context: "卧推第 1 组后休息", enabled: true, isRunning: true,
  onNudge: vi.fn(), onPause: vi.fn(), onReset: vi.fn(), onResume: vi.fn(),
  onSecondsChange: vi.fn(), onSkip: vi.fn(), onToggle: vi.fn(),
  options: [60, 90, 120, 180], remaining: 0, seconds: 120
};

function render(props: Partial<RestTimerSurfaceProps>) {
  const view = document.createElement("div");
  const root = createRoot(view);
  act(() => root.render(<RestTimerSurface {...defaults} {...props} />));
  return { root, view };
}

it("keeps inactive settings compact and only floats while rest is active", () => {
  let rendered = render({ remaining: 0 });
  expect(rendered.view.textContent).toContain("组间休息 120 秒");
  expect(rendered.view.querySelector("[data-rest-timer-floating]")).toBeNull();
  act(() => rendered.root.unmount());
  rendered = render({ remaining: 75 });
  const floating = rendered.view.querySelector("[data-rest-timer-floating]");
  expect(floating?.className).toContain("bottom-[calc(10rem+env(safe-area-inset-bottom))]");
  expect(rendered.view.textContent).toContain("01:15");
  act(() => rendered.root.unmount());
});

it("offers 44px active controls", () => {
  const { root, view } = render({ remaining: 75 });
  for (const label of ["暂停", "+15秒", "重置", "跳过"]) {
    const button = [...view.querySelectorAll("button")].find((item) => item.textContent === label);
    expect(button?.className).toContain("h-11");
  }
  act(() => root.unmount());
});
