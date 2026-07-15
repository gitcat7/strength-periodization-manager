/* @vitest-environment jsdom */

import { act, useRef, useState, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ProgramRegenerationDialog } from "./program-regeneration-dialog";
import type { RegenerationDialogState } from "./program-regeneration-dialog-state";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const inertValues = new WeakMap<HTMLElement, boolean>();
let inertDescriptor: PropertyDescriptor | undefined;

beforeAll(() => {
  inertDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "inert");
  if (inertDescriptor) return;

  Object.defineProperty(HTMLElement.prototype, "inert", {
    configurable: true,
    get(this: HTMLElement) {
      return inertValues.get(this) ?? false;
    },
    set(this: HTMLElement, value: boolean) {
      inertValues.set(this, value);
    }
  });
});

afterAll(() => {
  if (inertDescriptor) return;
  Reflect.deleteProperty(HTMLElement.prototype, "inert");
});

const readyState: Extract<RegenerationDialogState, { open: true }> = {
  error: "",
  open: true,
  phase: "preview",
  preview: {
    endDate: "2026-07-31",
    restDays: 12,
    trainingDays: 16,
    unfinishedRestDays: 2,
    unfinishedTrainingDays: 3
  },
  selection: {
    payload: { schedule_items: [] },
    scheduleLabel: "固定星期",
    startDate: "2026-07-04",
    templateLabel: "推/拉/蹲"
  }
};

function renderDialog({
  onClose = vi.fn(),
  onConfirm = vi.fn(),
  onReload = vi.fn(),
  state = readyState
}: {
  onClose?: () => void;
  onConfirm?: () => void;
  onReload?: () => void;
  state?: Extract<RegenerationDialogState, { open: true }>;
} = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  function Harness() {
    const returnFocusRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(true);

    return (
      <>
        <button data-testid="regeneration-trigger" ref={returnFocusRef} type="button">
          重新生成计划
        </button>
        <button data-testid="background-control" type="button">
          页面背景按钮
        </button>
        {open ? (
          <ProgramRegenerationDialog
            onClose={() => {
              onClose();
              setOpen(false);
            }}
            onConfirm={onConfirm}
            onReload={onReload}
            returnFocusRef={returnFocusRef as RefObject<HTMLButtonElement | null>}
            state={state}
          />
        ) : null}
      </>
    );
  }

  act(() => root.render(<Harness />));

  return {
    container,
    root,
    get backgroundControl() {
      return container.querySelector<HTMLButtonElement>("[data-testid='background-control']")!;
    },
    get dialog() {
      return container.querySelector<HTMLDivElement>("[role='dialog']")!;
    },
    get trigger() {
      return container.querySelector<HTMLButtonElement>("[data-testid='regeneration-trigger']")!;
    }
  };
}

const rendered: Array<{ container: HTMLDivElement; root: Root }> = [];

afterEach(() => {
  for (const { container, root } of rendered.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

function pressTab(shiftKey = false) {
  act(() => document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab", shiftKey })));
}

describe("ProgramRegenerationDialog", () => {
  it("mounts with focus contained in the dialog and restores the trigger after close", () => {
    const view = renderDialog();
    rendered.push(view);
    const heading = view.dialog.querySelector<HTMLHeadingElement>("#program-regeneration-heading")!;
    const [cancel, confirm] = Array.from(view.dialog.querySelectorAll<HTMLButtonElement>("button"));

    expect(document.activeElement).toBe(heading);
    expect(view.backgroundControl.inert).toBe(true);

    act(() => confirm.focus());
    pressTab();
    expect(document.activeElement).toBe(cancel);

    act(() => cancel.focus());
    pressTab(true);
    expect(document.activeElement).toBe(confirm);

    act(() => view.backgroundControl.focus());
    pressTab();
    expect(document.activeElement).toBe(cancel);

    act(() => cancel.click());
    expect(view.container.querySelector("[role='dialog']")).toBeNull();
    expect(document.activeElement).toBe(view.trigger);
    expect(view.backgroundControl.inert).toBe(false);
  });

  it("does not close or invoke controls while submitting", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const view = renderDialog({ onClose, onConfirm, state: { ...readyState, phase: "submitting" } });
    rendered.push(view);
    const [cancel, confirm] = Array.from(view.dialog.querySelectorAll<HTMLButtonElement>("button"));

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })));
    act(() => view.dialog.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    act(() => cancel.click());
    act(() => confirm.click());

    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(cancel.disabled).toBe(true);
    expect(confirm.disabled).toBe(true);
    expect(view.container.querySelector("[role='dialog']")).not.toBeNull();
  });

  it("offers reload instead of a second confirmation after the replacement already committed", () => {
    const onConfirm = vi.fn();
    const onReload = vi.fn();
    const view = renderDialog({
      onConfirm,
      onReload,
      state: { ...readyState, error: "新计划已生成，但无法加载最新日程。", phase: "reloadFailed" }
    });
    rendered.push(view);

    const buttons = Array.from(view.dialog.querySelectorAll<HTMLButtonElement>("button"));
    expect(buttons.map((button) => button.textContent)).toContain("重新加载页面");
    expect(buttons.map((button) => button.textContent)).not.toContain("确认生成新计划");

    act(() => buttons.find((button) => button.textContent === "重新加载页面")?.click());
    expect(onReload).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(buttons.find((button) => button.textContent === "取消")?.disabled).toBe(true);
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })));
    expect(view.container.querySelector("[role='dialog']")).not.toBeNull();
  });
});
