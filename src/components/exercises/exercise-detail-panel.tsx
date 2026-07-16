"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import type { ExternalExerciseReference } from "@/domain/external-exercise";
import type { LocalExerciseGuidance } from "@/domain/exercise-guidance";
import { createDetailFocusManager, getNextDialogFocusTarget } from "./exercise-detail-focus";

type ExerciseDetailPanelProps = {
  localGuidance: LocalExerciseGuidance | null;
  onClose: () => void;
  open: boolean;
  reference: ExternalExerciseReference | null;
  restoreFocusTarget?: HTMLElement | null;
  desktopSide?: boolean;
};

export function ExerciseDetailPanel({
  desktopSide = false,
  localGuidance,
  onClose,
  open,
  reference,
  restoreFocusTarget = null
}: ExerciseDetailPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const focusManagerRef = useRef(createDetailFocusManager());
  const onCloseRef = useRef(onClose);
  const [isMobile, setIsMobile] = useState(false);
  const titleId = useId();
  const detail = reference ?? localGuidance;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || !detail) return;

    const focusManager = focusManagerRef.current;
    focusManager.capture(
      restoreFocusTarget ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    );

    if (!isMobile) {
      return () => focusManager.restore();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const focusTarget = getNextDialogFocusTarget(
        getDialogFocusTargets(dialogRef.current),
        document.activeElement instanceof HTMLElement ? document.activeElement : null,
        event.shiftKey
      );
      if (!focusTarget) return;

      event.preventDefault();
      focusTarget.focus();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      focusManager.restore();
    };
  }, [detail, isMobile, open, restoreFocusTarget]);

  if (!open || !detail) return null;

  const title = reference ? reference.name : localGuidance!.nameZh;

  return (
    <div
      aria-labelledby={titleId}
      aria-modal={isMobile ? "true" : undefined}
      className={`fixed inset-0 z-50 flex items-end bg-black/40 md:items-stretch ${
        desktopSide ? "md:static md:z-auto md:bg-transparent" : "md:items-center md:justify-center"
      }`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !desktopSide) onClose();
      }}
      role="dialog"
    >
      <section
        className={`max-h-[min(82dvh,44rem)] w-full overflow-y-auto rounded-t-xl bg-white px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 shadow-xl md:max-h-none md:rounded-xl ${
          desktopSide ? "md:h-full md:w-[360px]" : "md:max-h-[80vh] md:max-w-lg md:rounded-xl"
        }`}
        ref={dialogRef}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold" id={titleId}>
              {title}
            </h2>
            {reference ? <p className="mt-1 text-sm text-muted">wger 动作引用</p> : null}
          </div>
          <button
            aria-label="关闭动作详情"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line text-ink hover:bg-field focus-visible:outline focus-visible:outline-2 focus-visible:outline-action"
            onClick={onClose}
            ref={closeButtonRef}
            title="关闭动作详情"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
          <div>
            <dt className="text-muted">器械</dt>
            <dd className="mt-1 font-medium text-ink">{reference ? reference.equipment.join("、") || "未注明" : localGuidance!.equipment}</dd>
          </div>
          <div>
            <dt className="text-muted">目标肌群</dt>
            <dd className="mt-1 font-medium text-ink">{reference ? reference.muscles.join("、") || reference.category || "未注明" : localGuidance!.target}</dd>
          </div>
          {reference ? (
            <div className="col-span-2">
              <dt className="text-muted">分类</dt>
              <dd className="mt-1 font-medium text-ink">{reference.category ?? "未注明"}</dd>
            </div>
          ) : null}
        </dl>

        {localGuidance ? <section className="mt-6">
          <h3 className="font-semibold">动作要点</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{localGuidance.instructionsZh}</p>
        </section> : null}

        <section className="mt-5 rounded-lg bg-field p-3">
          <h3 className="text-sm font-semibold">新手提示</h3>
          <p className="mt-1 text-sm leading-6 text-muted">
            先用能稳定控制全程的重量练习。出现疼痛、明显代偿或动作轨迹失控时，停止并寻求合格教练评估。
          </p>
        </section>

        {reference ? (
          <footer className="mt-6 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4 text-sm">
            <a className="inline-flex items-center gap-1 font-semibold text-action" href={reference.sourceUrl} rel="noreferrer" target="_blank">
              wger 来源
              <ExternalLink size={14} />
            </a>
            <a className="inline-flex items-center gap-1 font-semibold text-action" href="https://wger.de/api/v2/" rel="noreferrer" target="_blank">
              许可说明
              <ExternalLink size={14} />
            </a>
          </footer>
        ) : null}
      </section>
    </div>
  );
}

function getDialogFocusTargets(dialog: HTMLElement | null) {
  if (!dialog) return [];

  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => element.tabIndex >= 0);
}
