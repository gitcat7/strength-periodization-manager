/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { HistoryDateFilter } from "./training-history";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("HistoryDateFilter", () => {
  it("shows an empty selected-day state with a reset action", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(
      <HistoryDateFilter
        hasResults={false}
        onSelectedDateChange={() => undefined}
        selectedDate="2026-07-27"
      />
    ));

    expect(container.textContent).toContain("选择训练日期");
    expect(container.textContent).toContain("全部历史");
    expect(container.textContent).toContain("当天没有完成训练");
  });
});
