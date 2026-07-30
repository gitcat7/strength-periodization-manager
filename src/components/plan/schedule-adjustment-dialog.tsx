"use client";

import { Loader2 } from "lucide-react";
import type { RecoveryLoadAdvice, ResumePreview, ResumeRoute } from "@/domain/schedule-adjustment";

export type ScheduleAdjustmentDialogProps = {
  preview: ResumePreview;
  selectedRoute: ResumeRoute | null;
  onSelectRoute: (route: ResumeRoute) => void;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  errorMessage?: string | null;
  recoveryAdvice?: RecoveryLoadAdvice | null;
  requireInjuryAcknowledgement?: boolean;
  injuryAcknowledged?: boolean;
  onInjuryAcknowledgedChange?: (acknowledged: boolean) => void;
};

const routeOptions: Array<{ value: ResumeRoute; label: string; description: string }> = [
  {
    value: "continue_current_cycle",
    label: "继续当前循环",
    description: "从未完成的第一节继续，训练顺序保持不变。"
  },
  {
    value: "start_next_cycle",
    label: "从下个循环第一节开始",
    description: "跳过本循环剩余训练，从下一个循环重新开始。"
  }
];

export function ScheduleAdjustmentDialog({
  preview,
  selectedRoute,
  onSelectRoute,
  onConfirm,
  onCancel,
  busy = false,
  errorMessage = null,
  recoveryAdvice = null,
  requireInjuryAcknowledgement = false,
  injuryAcknowledged = false,
  onInjuryAcknowledgedChange
}: ScheduleAdjustmentDialogProps) {
  const canConfirm =
    !busy && selectedRoute !== null && (!requireInjuryAcknowledgement || injuryAcknowledged);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4" role="presentation">
      <section
        aria-label="确认日程调整"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-line bg-white p-5 shadow-xl"
        role="dialog"
      >
        <div className="mb-4">
          <p className="page-kicker">日程调整</p>
          <h2 className="text-xl font-bold">确认日程调整</h2>
          <p className="mt-1 text-sm text-muted">
            选择恢复路线后再确认。确认前不会修改任何训练安排。
          </p>
        </div>

        <div className="space-y-2" role="radiogroup" aria-label="恢复路线">
          {routeOptions.map((option) => (
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                selectedRoute === option.value ? "border-action bg-action/5" : "border-line bg-field"
              } ${busy ? "pointer-events-none opacity-60" : ""}`}
              key={option.value}
            >
              <input
                checked={selectedRoute === option.value}
                className="mt-1 h-4 w-4"
                disabled={busy}
                name="resume-route"
                onChange={() => onSelectRoute(option.value)}
                type="radio"
              />
              <span>
                <span className="block font-semibold">{option.label}</span>
                <span className="text-muted">{option.description}</span>
              </span>
            </label>
          ))}
        </div>

        {selectedRoute ? (
          <div className="mt-4 rounded-lg bg-field p-3 text-sm">
            <p className="font-semibold">调整预览</p>
            <ul className="mt-2 space-y-1 text-muted">
              <li>恢复日期：{preview.resumedOn}</li>
              <li>下一节：{preview.nextDirection}</li>
              {preview.dateDeltaDays > 0 ? <li>日程整体顺延 {preview.dateDeltaDays} 天</li> : null}
              {preview.skippedWorkoutNames.length > 0 ? (
                <li>
                  本循环跳过：
                  {preview.skippedWorkoutNames.join("、")}
                  （标记为恢复策略跳过，不计入训练指标）
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {recoveryAdvice ? (
          <div className="mt-3 rounded-lg border border-[#4a7a9a]/30 bg-[#4a7a9a]/5 p-3 text-sm">
            <p className="font-semibold text-[#4a7a9a]">{recoveryAdvice.title}</p>
            <p className="mt-1 text-muted">{recoveryAdvice.message}</p>
          </div>
        ) : null}

        {requireInjuryAcknowledgement ? (
          <label className="mt-3 flex items-start gap-3 rounded-lg border border-line p-3 text-sm">
            <input
              checked={injuryAcknowledged}
              className="mt-1 h-4 w-4"
              disabled={busy}
              onChange={(event) => onInjuryAcknowledgedChange?.(event.target.checked)}
              type="checkbox"
            />
            <span>我已适合恢复一般训练；本产品不提供医疗判断</span>
          </label>
        ) : null}

        {errorMessage ? (
          <p className="mt-3 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600">{errorMessage}</p>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-action px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canConfirm}
            onClick={onConfirm}
            type="button"
          >
            {busy ? <Loader2 className="animate-spin" size={18} /> : null}
            确认调整
          </button>
        </div>
      </section>
    </div>
  );
}
