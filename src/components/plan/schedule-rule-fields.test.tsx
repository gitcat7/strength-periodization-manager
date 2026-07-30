/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleRuleFields } from "./schedule-rule-fields";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderFields(props: Partial<Parameters<typeof ScheduleRuleFields>[0]> = {}) {
  const onChange = vi.fn();
  const onHolidayPolicyChange = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() =>
    root?.render(
      <ScheduleRuleFields
        holidayPolicy="train"
        onChange={onChange}
        onHolidayPolicyChange={onHolidayPolicyChange}
        previewStartDate="2026-08-03"
        value={{ mode: "cadence", trainDays: 3, restDays: 1 }}
        {...props}
      />
    )
  );

  return { onChange, onHolidayPolicyChange };
}

describe("ScheduleRuleFields", () => {
  it("shows cadence presets instead of weekly training days", () => {
    renderFields();

    expect(container?.textContent).toContain("练三休一");
    expect(container?.textContent).not.toContain("每周训练天数");
  });

  it("applies the weekend-rest weekday preset", () => {
    const { onChange } = renderFields({ value: { mode: "fixed_weekdays", weekdays: [1, 3, 5] } });

    const presetButton = Array.from(container?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === "工作日训练、周末双休"
    );
    expect(presetButton).toBeDefined();
    act(() => presetButton?.click());

    expect(onChange).toHaveBeenLastCalledWith({ mode: "fixed_weekdays", weekdays: [1, 2, 3, 4, 5] });
  });

  it("renders a 28-day preview with density and predicted end date", () => {
    renderFields({ previewStartDate: "2026-08-03" });

    expect(container?.textContent).toContain("28 天预览");
    expect(container?.textContent).toContain("计划休息");
    expect(container?.textContent).toContain("每周 5.25 次");
    expect(container?.textContent).toContain("预计结束于 2026-08-30");
  });

  it("labels holiday rest days when the policy shifts training", () => {
    renderFields({
      holidayPolicy: "rest_and_shift",
      holidays: [{ date: "2026-10-01", name: "国庆节" }],
      previewStartDate: "2026-10-01",
      value: { mode: "cadence", trainDays: 1, restDays: 1 }
    });

    expect(container?.textContent).toContain("国庆节");
  });

  it("reports holiday policy changes", () => {
    const { onHolidayPolicyChange } = renderFields();

    const policySelect = container?.querySelector('select[aria-label="节假日安排"]');
    expect(policySelect).not.toBeNull();
    act(() => {
      if (policySelect) {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        nativeSetter?.call(policySelect, "rest_and_shift");
        policySelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    expect(onHolidayPolicyChange).toHaveBeenCalledWith("rest_and_shift");
  });
});
