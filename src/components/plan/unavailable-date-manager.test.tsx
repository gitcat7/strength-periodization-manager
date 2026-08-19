/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnavailableDateManager } from "./unavailable-date-manager";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderManager(props: Partial<Parameters<typeof UnavailableDateManager>[0]> = {}) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() =>
    root?.render(
      <UnavailableDateManager
        dates={[
          { id: "date-1", date: "2026-09-01", note: "出差" },
          { id: "date-2", date: "2026-09-08", note: null }
        ]}
        onAdd={onAdd}
        onRemove={onRemove}
        {...props}
      />
    )
  );

  return { onAdd, onRemove };
}

function findButton(text: string) {
  return (
    Array.from(container?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes(text)
    ) ?? null
  );
}

describe("UnavailableDateManager", () => {
  it("lists saved unavailable dates with notes", () => {
    renderManager();

    expect(container?.textContent).toContain("2026-09-01");
    expect(container?.textContent).toContain("出差");
    expect(container?.textContent).toContain("2026-09-08");
  });

  it("adds a new unavailable date with an optional note", () => {
    const { onAdd } = renderManager();

    const dateInput = container?.querySelector('input[aria-label="不可训练日期"]') as HTMLInputElement | null;
    const noteInput = container?.querySelector('input[aria-label="备注（可选）"]') as HTMLInputElement | null;
    expect(dateInput).not.toBeNull();

    act(() => {
      setInputValue(dateInput as HTMLInputElement, "2026-09-15");
      setInputValue(noteInput as HTMLInputElement, "考试");
    });
    act(() => findButton("添加")?.click());

    expect(onAdd).toHaveBeenCalledWith("2026-09-15", "考试");
  });

  it("keeps the add action disabled until a date is chosen", () => {
    const { onAdd } = renderManager();

    const addButton = findButton("添加");
    expect(addButton?.disabled).toBe(true);
    act(() => addButton?.click());
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("removes a saved date", () => {
    const { onRemove } = renderManager();

    act(() => findButton("删除 2026-09-01")?.click());
    expect(onRemove).toHaveBeenCalledWith("date-1");
  });

  it("disables all actions while busy", () => {
    renderManager({ busy: true });

    expect(findButton("添加")?.disabled).toBe(true);
    expect(findButton("删除 2026-09-01")?.disabled).toBe(true);
  });

  it("keeps every action at least 44px tall, including disabled actions", () => {
    renderManager({ busy: true });

    for (const action of container?.querySelectorAll("button") ?? []) {
      expect(action.className, action.textContent ?? action.getAttribute("aria-label") ?? "button").toContain("h-11");
    }
  });
});
