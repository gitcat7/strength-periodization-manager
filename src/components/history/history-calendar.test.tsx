// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { HistoryCalendar } from "./history-calendar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it("changes month, selects a day, and restores all history", () => {
  const onMonthChange = vi.fn();
  const onSelectedDateChange = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <HistoryCalendar
        entries={[
          { day_type: "training", id: "done", name: "推 A", scheduled_date: "2026-07-27", status: "completed", volume: 845 },
          { day_type: "training", id: "next", name: "拉 B", scheduled_date: "2026-07-28", status: "scheduled", volume: 0 },
          { day_type: "rest", id: "rest", name: "恢复日", scheduled_date: "2026-07-29", status: "scheduled", volume: 0 }
        ]}
        month="2026-07"
        onMonthChange={onMonthChange}
        onSelectedDateChange={onSelectedDateChange}
        selectedDate=""
      />
    );
  });

  getButton("查看 2026年6月").click();
  expect(onMonthChange).toHaveBeenCalledWith("2026-06");
  getButton("2026年7月27日，已完成训练，845 kg，推 A").click();
  expect(onSelectedDateChange).toHaveBeenCalledWith("2026-07-27");

  act(() => {
    root?.render(
      <HistoryCalendar
        entries={[
          { day_type: "training", id: "done", name: "推 A", scheduled_date: "2026-07-27", status: "completed", volume: 845 }
        ]}
        month="2026-07"
        onMonthChange={onMonthChange}
        onSelectedDateChange={onSelectedDateChange}
        selectedDate="2026-07-27"
      />
    );
  });
  getButton("全部历史").click();
  expect(onSelectedDateChange).toHaveBeenLastCalledWith("");
});

function getButton(label: string) {
  const button = Array.from(container?.querySelectorAll("button") ?? []).find((element) => element.getAttribute("aria-label") === label);
  if (!button) throw new Error(`Could not find button: ${label}`);
  return button as HTMLButtonElement;
}
