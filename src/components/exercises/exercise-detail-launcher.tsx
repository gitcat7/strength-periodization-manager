"use client";

import { useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import type { ExerciseCatalogRecord } from "@/domain/exercise-catalog";
import { getLocalExerciseGuidance, type LocalExerciseGuidance } from "@/domain/exercise-guidance";
import { loadExerciseCatalogRecord } from "@/lib/exercise-catalog-client";
import { ExerciseDetailPanel } from "./exercise-detail-panel";

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

  const available = Boolean(catalogExternalId || getLocalExerciseGuidance(exerciseSlug));
  if (!available) return null;

  async function openDetails() {
    setMessage("");
    const local = getLocalExerciseGuidance(exerciseSlug);
    if (local) {
      setLocalGuidance(local);
      setRecord(null);
      setOpen(true);
      return;
    }

    if (!catalogExternalId) return;
    setStatus("loading");
    try {
      const catalogRecord = await loadExerciseCatalogRecord(catalogExternalId);
      if (!catalogRecord) throw new Error("未找到这项动作的详细说明。");
      setRecord(catalogRecord);
      setLocalGuidance(null);
      setOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "动作说明加载失败，请稍后重试。");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <>
      <button
        aria-label={`查看${exerciseName}的动作说明`}
        className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink disabled:opacity-60"
        disabled={status === "loading"}
        onClick={openDetails}
        type="button"
      >
        {status === "loading" ? <Loader2 className="animate-spin" size={16} /> : <BookOpen size={16} />}
        动作说明
      </button>
      {message ? <p className="mt-2 text-sm text-red-600">{message}</p> : null}
      <ExerciseDetailPanel localGuidance={localGuidance} onClose={() => setOpen(false)} open={open} record={record} />
    </>
  );
}
