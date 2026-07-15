"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Loader2 } from "lucide-react";

import { getFocusTrapTarget } from "./program-regeneration-dialog-focus";
import type { RegenerationDialogState } from "./program-regeneration-dialog-state";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function ProgramRegenerationDialog({
  onClose,
  onConfirm,
  onReload,
  returnFocusRef,
  state
}: {
  onClose: () => void;
  onConfirm: () => void;
  onReload: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  state: Extract<RegenerationDialogState, { open: true }>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const onCloseRef = useRef(onClose);
  const submittingRef = useRef(false);
  const isSubmitting = state.phase === "submitting" || state.phase === "replacementCommitted";
  const canConfirm = state.phase === "preview";
  const reloadFailed = state.phase === "reloadFailed";
  const isLocked = isSubmitting || reloadFailed;

  onCloseRef.current = onClose;
  submittingRef.current = isLocked;

  useEffect(() => {
    headingRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submittingRef.current) onCloseRef.current();
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex >= 0
      );
      const target = getFocusTrapTarget(focusableElements, document.activeElement, event.shiftKey);
      if (target) {
        event.preventDefault();
        target.focus();
        return;
      }

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    const previouslyInert: Array<{ element: HTMLElement; inert: boolean }> = [];
    let current: HTMLElement | null = dialogRef.current;
    while (current && current !== document.body) {
      const parent = current.parentElement;
      if (!parent) break;

      for (const sibling of Array.from(parent.children)) {
        if (!(sibling instanceof HTMLElement) || sibling === current) continue;
        previouslyInert.push({ element: sibling, inert: sibling.inert });
        sibling.inert = true;
      }
      current = parent;
    }

    const returnFocusTarget = returnFocusRef.current;

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      for (const { element, inert } of previouslyInert) {
        element.inert = inert;
      }
      returnFocusTarget?.focus();
    };
  }, [returnFocusRef]);

  function closeFromBackdrop(event: React.MouseEvent<HTMLDivElement>) {
    if (!isLocked && event.target === event.currentTarget) onClose();
  }

  return (
    <div
      aria-labelledby="program-regeneration-heading"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-ink/40 md:items-center md:justify-center md:p-6"
      onMouseDown={closeFromBackdrop}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <section className="w-full rounded-t-2xl bg-white p-5 shadow-xl md:max-w-lg md:rounded-2xl" aria-busy={isSubmitting}>
        <h2 className="text-lg font-semibold" id="program-regeneration-heading" ref={headingRef} tabIndex={-1}>
          确认生成新计划
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          新计划将替换当前计划中未完成的日程；已完成记录会保留在历史中。
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-field p-3 text-sm">
          <div>
            <dt className="text-muted">训练模板</dt>
            <dd className="mt-1 font-semibold">{state.selection.templateLabel}</dd>
          </div>
          <div>
            <dt className="text-muted">安排方式</dt>
            <dd className="mt-1 font-semibold">{state.selection.scheduleLabel}</dd>
          </div>
          <div>
            <dt className="text-muted">日期范围</dt>
            <dd className="mt-1 font-semibold">{state.selection.startDate ?? "开始"} 至 {state.preview.endDate}</dd>
          </div>
          <div>
            <dt className="text-muted">计划日程</dt>
            <dd className="mt-1 font-semibold">
              训练 {state.preview.trainingDays} 天 · 休息 {state.preview.restDays} 天
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-sm text-muted">
          当前未完成：训练 {state.preview.unfinishedTrainingDays} 天 · 休息 {state.preview.unfinishedRestDays} 天
        </p>
        {state.error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p> : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="h-11 rounded-lg border border-line px-4 font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLocked}
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          {reloadFailed ? (
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-action px-4 font-semibold text-white"
              onClick={onReload}
              type="button"
            >
              重新加载页面
            </button>
          ) : (
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-action px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canConfirm}
              onClick={onConfirm}
              type="button"
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : null}
              {state.phase === "replacementCommitted" ? "正在加载新计划" : isSubmitting ? "正在生成计划" : "确认生成新计划"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
