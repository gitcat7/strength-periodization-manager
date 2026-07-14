"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import type { ExerciseCatalogRecord } from "@/domain/exercise-catalog";
import { getLocalExerciseGuidance, type LocalExerciseGuidance } from "@/domain/exercise-guidance";
import { loadExerciseCatalogRecord } from "@/lib/exercise-catalog-client";
import { ExerciseDetailPanel } from "./exercise-detail-panel";
import { createLatestExerciseDetailRequest } from "./exercise-detail-request";
import { resolveExerciseDetail } from "./exercise-detail-resolver";

type ExerciseDetailLauncherProps = {
  catalogExternalId?: string | null;
  exerciseName?: string;
  exerciseSlug: string;
};

export function ExerciseDetailLauncher({
  catalogExternalId,
  exerciseName = "动作",
  exerciseSlug
}: ExerciseDetailLauncherProps) {
  const [localGuidance, setLocalGuidance] = useState<LocalExerciseGuidance | null>(null);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<ExerciseCatalogRecord | null>(null);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const requestsRef = useRef(createLatestExerciseDetailRequest());
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => requestsRef.current.dispose(), []);

  const available = Boolean(catalogExternalId || getLocalExerciseGuidance(exerciseSlug));
  if (!available) return null;

  async function openDetails() {
    const request = requestsRef.current.start();
    setMessage("");
    setStatus("loading");
    try {
      const detail = await resolveExerciseDetail({
        catalogExternalId,
        exerciseSlug,
        getLocalGuidance: getLocalExerciseGuidance,
        loadCatalogRecord: loadExerciseCatalogRecord
      });
      if (!requestsRef.current.isCurrent(request)) return;

      setRecord(detail.record);
      setLocalGuidance(detail.localGuidance);
      setOpen(true);
    } catch (error) {
      if (!requestsRef.current.isCurrent(request)) return;
      setMessage(error instanceof Error ? error.message : "动作说明加载失败，请稍后重试。");
    } finally {
      if (requestsRef.current.isCurrent(request)) setStatus("idle");
    }
  }

  return (
    <>
      <button
        aria-label={`查看${exerciseName}的动作说明`}
        className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink disabled:opacity-60"
        disabled={status === "loading"}
        onClick={openDetails}
        ref={triggerRef}
        type="button"
      >
        {status === "loading" ? <Loader2 className="animate-spin" size={16} /> : <BookOpen size={16} />}
        动作说明
      </button>
      {message ? <p className="mt-2 text-sm text-red-600">{message}</p> : null}
      <ExerciseDetailPanel
        localGuidance={localGuidance}
        onClose={() => setOpen(false)}
        open={open}
        record={record}
        restoreFocusTarget={triggerRef.current}
      />
    </>
  );
}
