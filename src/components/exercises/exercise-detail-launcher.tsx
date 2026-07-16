"use client";

import { useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { getLocalExerciseGuidance, type LocalExerciseGuidance } from "@/domain/exercise-guidance";
import { ExerciseDetailPanel } from "./exercise-detail-panel";

type ExerciseDetailLauncherProps = {
  exerciseName?: string;
  exerciseSlug: string;
};

export function ExerciseDetailLauncher({
  exerciseName = "动作",
  exerciseSlug
}: ExerciseDetailLauncherProps) {
  const [localGuidance, setLocalGuidance] = useState<LocalExerciseGuidance | null>(null);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function openDetails() {
    setLocalGuidance(getLocalExerciseGuidance(exerciseSlug, exerciseName));
    setOpen(true);
  }

  return (
    <>
      <button
        aria-label={`查看${exerciseName}的动作说明`}
        className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink disabled:opacity-60"
        onClick={openDetails}
        ref={triggerRef}
        type="button"
      >
        <BookOpen size={16} />
        动作说明
      </button>
      <ExerciseDetailPanel
        localGuidance={localGuidance}
        onClose={() => setOpen(false)}
        open={open}
        reference={null}
        restoreFocusTarget={triggerRef.current}
      />
    </>
  );
}
