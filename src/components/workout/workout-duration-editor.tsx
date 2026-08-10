"use client";

import { formatWorkoutDuration } from "@/domain/workout-duration";

type WorkoutDurationEditorProps = {
  automaticMinutes: number | null;
  manualMinutes: string;
  onManualMinutesChange(value: string): void;
  onManualModeChange(enabled: boolean): void;
  manualMode: boolean;
};

export function WorkoutDurationEditor({
  automaticMinutes,
  manualMinutes,
  manualMode,
  onManualMinutesChange,
  onManualModeChange
}: WorkoutDurationEditorProps) {
  const requiresManualDuration = automaticMinutes === null;
  const showManualInput = manualMode || requiresManualDuration;

  return (
    <section className="rounded-xl border border-border bg-surface p-4" aria-label="训练时长确认">
      <p className="text-sm font-medium text-foreground">
        {requiresManualDuration ? "尚未记录开始时间，请填写实际训练时长。" : `自动记录时长：${formatWorkoutDuration(automaticMinutes * 60)}`}
      </p>
      <p className="mt-2 text-sm text-muted">如果训练结束后忘记及时点击完成，请检查并修改时长。</p>
      {!showManualInput ? (
        <button type="button" className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-foreground" onClick={() => onManualModeChange(true)}>
          修改时长
        </button>
      ) : (
        <label className="mt-3 block text-sm font-medium text-foreground">
          实际训练时长（分钟）
          <input
            aria-label="实际训练时长（分钟）"
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3"
            inputMode="numeric"
            max="720"
            min="1"
            onChange={(event) => onManualMinutesChange(event.target.value)}
            type="text"
            value={manualMinutes}
          />
          <span className="mt-1 block text-xs font-normal text-muted">请输入 1–720 的整数分钟。</span>
        </label>
      )}
    </section>
  );
}
