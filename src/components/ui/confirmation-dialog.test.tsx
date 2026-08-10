/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import { ConfirmationDialog } from "./confirmation-dialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("renders only when open and exposes cancel and destructive confirmation", () => {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const view = document.createElement("div");
  const root = createRoot(view);

  act(() => root.render(
    <ConfirmationDialog
      confirmLabel="确认退出"
      description="退出后需要重新登录。"
      onCancel={onCancel}
      onConfirm={onConfirm}
      open
      title="退出登录？"
    />
  ));

  expect(view.querySelector("[role='dialog']")?.getAttribute("aria-modal")).toBe("true");
  const buttons = [...view.querySelectorAll("button")];
  expect(buttons.every((button) => button.className.includes("h-11"))).toBe(true);
  act(() => buttons.find((button) => button.textContent === "取消")?.click());
  expect(onCancel).toHaveBeenCalledOnce();
  act(() => buttons.find((button) => button.textContent === "确认退出")?.click());
  expect(onConfirm).toHaveBeenCalledOnce();

  act(() => root.render(
    <ConfirmationDialog
      confirmLabel="确认退出"
      description="退出后需要重新登录。"
      onCancel={onCancel}
      onConfirm={onConfirm}
      open={false}
      title="退出登录？"
    />
  ));
  expect(view.querySelector("[role='dialog']")).toBeNull();
  act(() => root.unmount());
});

it("disables both actions while a confirmation is busy", () => {
  const view = document.createElement("div");
  const root = createRoot(view);
  act(() => root.render(
    <ConfirmationDialog
      busy
      confirmLabel="确认撤销"
      description="撤销后此令牌立即失效。"
      onCancel={() => undefined}
      onConfirm={() => undefined}
      open
      title="撤销令牌？"
    />
  ));
  expect([...view.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
  act(() => root.unmount());
});
