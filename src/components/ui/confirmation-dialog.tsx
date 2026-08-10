import { useId } from "react";

export type ConfirmationDialogProps = {
  busy?: boolean;
  confirmLabel: string;
  description: string;
  onCancel(): void;
  onConfirm(): void;
  open: boolean;
  title: string;
};

export function ConfirmationDialog({
  busy = false,
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  open,
  title
}: ConfirmationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid items-end bg-black/40 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:place-items-center">
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl"
        role="dialog"
      >
        <h2 className="break-words text-lg font-semibold" id={titleId}>{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted" id={descriptionId}>{description}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="h-11 rounded-lg border border-line bg-white px-4 font-semibold text-ink disabled:opacity-50"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className="h-11 rounded-lg border border-red-600 bg-red-600 px-4 font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
