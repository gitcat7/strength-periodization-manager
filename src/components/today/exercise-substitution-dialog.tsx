"use client";

import { useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import { Loader2, RefreshCcw, X } from "lucide-react";
import {
  exerciseSubstitutionDialogReducer,
  getInitialExerciseSubstitutionDialogState,
  isCompatibleCandidate,
  type ExerciseSubstitutionScope,
  type SubstitutionCandidate
} from "./exercise-substitution-dialog-state";

type ExerciseSubstitutionDialogProps = {
  alternatives: SubstitutionCandidate[];
  error: string | null;
  onClose: () => void;
  onConfirm: (
    source: SubstitutionCandidate,
    target: SubstitutionCandidate,
    scope: ExerciseSubstitutionScope
  ) => Promise<void>;
  open: boolean;
  saving: boolean;
  source: SubstitutionCandidate;
};

export function ExerciseSubstitutionDialog({
  alternatives,
  error,
  onClose,
  onConfirm,
  open,
  saving,
  source
}: ExerciseSubstitutionDialogProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const submittingRef = useRef(false);
  const [isMobile, setIsMobile] = useState(false);
  const candidates = useMemo(
    () => alternatives.filter((candidate) => isCompatibleCandidate(source, candidate)),
    [alternatives, source]
  );

  const [state, dispatch] = useReducer(
    exerciseSubstitutionDialogReducer,
    getInitialExerciseSubstitutionDialogState(source, candidates)
  );

  // Sync external open/close and error with internal reducer state
  useEffect(() => {
    if (open && !state.open) {
      dispatch({ type: "open", source, alternatives: candidates });
    } else if (!open && state.open) {
      dispatch({ type: "reset" });
    }
  }, [open, state.open, source, candidates]);

  useEffect(() => {
    if (error !== state.error) {
      dispatch({ type: "setError", error });
    }
  }, [error, state.error]);

  useEffect(() => {
    if (saving !== state.saving) {
      dispatch({ type: "setSaving", saving });
    }
  }, [saving, state.saving]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!state.open) return;

    const previousOverflow = document.body.style.overflow;
    if (isMobile) {
      document.body.style.overflow = "hidden";
      closeButtonRef.current?.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!state.saving) {
          onClose();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobile, state.open, state.saving, onClose]);

  const selectedTarget = useMemo(
    () => candidates.find((candidate) => candidate.id === state.targetId) ?? null,
    [candidates, state.targetId]
  );

  function handleSelectTarget(nextTargetId: string) {
    dispatch({ type: "selectTarget", targetId: nextTargetId });
  }

  function handleSelectScope(nextScope: ExerciseSubstitutionScope) {
    dispatch({ type: "selectScope", scope: nextScope });
  }

  async function handleConfirm() {
    if (!selectedTarget || state.saving || submittingRef.current) return;

    submittingRef.current = true;
    try {
      await onConfirm(source, selectedTarget, state.scope);
    } finally {
      submittingRef.current = false;
    }
  }

  function handleClose() {
    if (!state.saving) {
      onClose();
    }
  }

  if (!state.open) return null;

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !state.saving) {
          onClose();
        }
      }}
      role="dialog"
    >
      <section
        className="max-h-[min(82dvh,44rem)] w-full overflow-y-auto rounded-t-xl bg-white px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 shadow-xl md:max-h-[80vh] md:max-w-lg md:rounded-xl"
        ref={dialogRef}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold" id={titleId}>
              替换动作
            </h2>
            <p className="mt-1 text-sm text-muted">
              将 <span className="font-medium text-ink">{source.name}</span> 替换为：
            </p>
          </div>
          <button
            aria-label="关闭替换对话框"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line text-ink hover:bg-field focus-visible:outline focus-visible:outline-2 focus-visible:outline-action"
            disabled={state.saving}
            onClick={handleClose}
            ref={closeButtonRef}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {candidates.length === 0 ? (
          <div className="space-y-4">
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">没有可替换的兼容动作。</p>
            <button
              className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-line px-4 font-semibold text-ink"
              onClick={handleClose}
              type="button"
            >
              关闭
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="sr-only">选择替换动作</legend>
              {candidates.map((candidate) => (
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                    state.targetId === candidate.id ? "border-action bg-action/5" : "border-line bg-white"
                  }`}
                  key={candidate.id}
                >
                  <input
                    checked={state.targetId === candidate.id}
                    className="h-4 w-4 accent-action"
                    name="substitution-target"
                    onChange={() => handleSelectTarget(candidate.id)}
                    type="radio"
                    value={candidate.id}
                  />
                  <span className="font-medium">{candidate.name}</span>
                </label>
              ))}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">应用范围</legend>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                  state.scope === "current_workout" ? "border-action bg-action/5" : "border-line bg-white"
                }`}
              >
                <input
                  checked={state.scope === "current_workout"}
                  className="h-4 w-4 accent-action"
                  name="substitution-scope"
                  onChange={() => handleSelectScope("current_workout")}
                  type="radio"
                  value="current_workout"
                />
                <span className="font-medium">仅本次训练</span>
              </label>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                  state.scope === "remaining_program" ? "border-action bg-action/5" : "border-line bg-white"
                }`}
              >
                <input
                  checked={state.scope === "remaining_program"}
                  className="h-4 w-4 accent-action"
                  name="substitution-scope"
                  onChange={() => handleSelectScope("remaining_program")}
                  type="radio"
                  value="remaining_program"
                />
                <span className="font-medium">本周期后续同类训练</span>
              </label>
            </fieldset>

            <div className="rounded-lg bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-950">注意</p>
              <p className="mt-1 text-sm text-amber-900">新动作重量将重置为 0kg，目标组数与次数保持不变。</p>
            </div>

            {state.error ? (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <RefreshCcw className="mt-0.5 shrink-0" size={16} />
                <span>{state.error}</span>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <button
                className="inline-flex h-11 items-center justify-center rounded-lg border border-line px-4 font-semibold text-ink disabled:opacity-60"
                disabled={state.saving}
                onClick={handleClose}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-action px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!selectedTarget || state.saving}
                onClick={handleConfirm}
                type="button"
              >
                {state.saving ? <Loader2 className="animate-spin" size={17} /> : null}
                确认替换
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
