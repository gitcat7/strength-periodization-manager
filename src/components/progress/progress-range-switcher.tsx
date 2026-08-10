import {
  progressRangeOptions,
  type ProgressRangeWeeks
} from "@/domain/progress-range";

export function ProgressRangeSwitcher({
  onChange,
  value
}: {
  onChange(value: ProgressRangeWeeks): void;
  value: ProgressRangeWeeks;
}) {
  return (
    <div aria-label="进展时间范围" className="grid grid-cols-3 gap-2" role="group">
      {progressRangeOptions.map((weeks) => {
        const selected = value === weeks;
        return (
          <button
            aria-pressed={selected}
            className={`h-11 rounded-lg px-3 text-sm font-semibold transition ${
              selected ? "bg-action text-white" : "border border-line bg-white text-ink"
            }`}
            key={weeks}
            onClick={() => onChange(weeks)}
            type="button"
          >
            {weeks}周
          </button>
        );
      })}
    </div>
  );
}
